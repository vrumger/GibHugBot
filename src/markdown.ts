const FENCE = /^[\s>]*(`{3,}|~{3,})/;
const BLANK_LINE = /[ \t>]*\r?\n/y;
const MEDIA_TAG = /^<(img|video|audio)\b[^>]*>/i;
const MEDIA_CLOSING_TAG = /^<\/(?:video|audio)\s*>/i;
const ANCHOR_TAG = /^<a\b[^>]*>/i;
const ANCHOR_CLOSING_TAG = /^<\/a\s*>/i;
// Bounds bracket matching, so bodies full of unclosed brackets stay fast.
const MAX_BRACKET_LENGTH = 2000;

const getAttribute = (tag: string, name: string) => {
    const match = tag.match(
        new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
    );
    return match?.slice(1).find(value => value !== undefined);
};

// Returns the index of the bracket that closes the one at `start`, within the
// same paragraph.
const findClosing = (text: string, start: number) => {
    const open = text[start];
    const close = open === '[' ? ']' : ')';
    const end = Math.min(text.length, start + MAX_BRACKET_LENGTH);
    let depth = 0;

    for (let i = start; i < end; i++) {
        if (text[i] === '\\') {
            i++;
        } else if (text[i] === '\n') {
            BLANK_LINE.lastIndex = i + 1;
            if (BLANK_LINE.test(text)) {
                return -1;
            }
        } else if (text[i] === open) {
            depth++;
        } else if (text[i] === close && --depth === 0) {
            return i;
        }
    }

    return -1;
};

// Returns the index after the code span that starts at `start`, or after its
// opening backticks if it's never closed.
const codeSpanEnd = (text: string, start: number) => {
    const run = text.slice(start).match(/^`+/)![0];
    const closing = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
    closing.lastIndex = start + run.length;
    const match = closing.exec(text);
    return match ? match.index + run.length : start + run.length;
};

// Parses `![alt](destination)`, `![alt][ref]` or `![alt]` at `start`.
const parseImage = (text: string, start: number) => {
    const altEnd = findClosing(text, start + 1);
    if (altEnd === -1) {
        return;
    }

    const alt = text.slice(start + 2, altEnd);
    let end = altEnd + 1;

    if (text[end] === '(' || text[end] === '[') {
        const close = findClosing(text, end);
        if (close === -1) {
            return;
        }

        end = close + 1;
    }

    return { alt, target: text.slice(altEnd + 1, end), end };
};

const replaceMediaTag = (tag: string, name: string, insideLink: boolean) => {
    const src = getAttribute(tag, 'src');
    const alt = (getAttribute(tag, 'alt') || '')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    if (insideLink || !src) {
        return alt;
    }

    return `<a href="${src.replace(/"/g, '&quot;')}">${
        alt || (name === 'img' ? 'image' : name)
    }</a>`;
};

const isBlank = (text: string) => text.replace(/<[^>]*>/g, '').trim() === '';

// Media inside a link is replaced with its alt text, since links can't be
// nested. A link left with no text gets "image" so it stays visible.
class Link {
    hasMedia = false;

    constructor(private readonly start: number) {}

    label(result: string) {
        return this.hasMedia && isBlank(result.slice(this.start))
            ? 'image'
            : '';
    }
}

const removeInlineMedia = (text: string) => {
    let result = '';
    let anchor: Link | undefined;
    let link: Link | undefined;
    // Index of the `]` that closes the link label we're in.
    let linkEnd = -1;
    let i = 0;

    while (i < text.length) {
        if (link && i >= linkEnd) {
            result += link.label(result);
            link = undefined;
        }

        const rest = text.slice(i, i + MAX_BRACKET_LENGTH);
        const parent = link ?? anchor;

        if (rest[0] === '\\') {
            result += rest.slice(0, 2);
            i += 2;
            continue;
        }

        if (rest[0] === '`') {
            const end = codeSpanEnd(text, i);
            result += text.slice(i, end);
            i = end;
            continue;
        }

        if (rest[0] === '<') {
            const media = rest.match(MEDIA_TAG);
            if (media) {
                result += replaceMediaTag(
                    media[0],
                    media[1].toLowerCase(),
                    parent !== undefined,
                );
                if (parent) {
                    parent.hasMedia = true;
                }

                i += media[0].length;
                continue;
            }

            const mediaClosing = rest.match(MEDIA_CLOSING_TAG);
            if (mediaClosing) {
                i += mediaClosing[0].length;
                continue;
            }

            const anchorTag = rest.match(ANCHOR_TAG);
            if (anchorTag) {
                result += anchorTag[0];
                anchor = new Link(result.length);
                i += anchorTag[0].length;
                continue;
            }

            if (anchor && ANCHOR_CLOSING_TAG.test(rest)) {
                result += anchor.label(result);
                anchor = undefined;
            }
        }

        if (rest.startsWith('![')) {
            const image = parseImage(text, i);
            if (image) {
                if (parent) {
                    result += image.alt;
                    parent.hasMedia = true;
                } else {
                    result += `[${
                        image.alt || (image.target ? 'image' : '')
                    }]${image.target}`;
                }

                i = image.end;
                continue;
            }
        }

        if (rest[0] === '[' && !link) {
            const close = findClosing(text, i);
            if (close !== -1 && /[([]/.test(text[close + 1] ?? '')) {
                link = new Link(result.length + 1);
                linkEnd = close;
            }
        }

        result += rest[0];
        i++;
    }

    return result;
};

// Applies `transform` to every run of text outside fenced code blocks.
const mapText = (markdown: string, transform: (text: string) => string) => {
    const result: string[] = [];
    let text: string[] = [];
    let fence: string | undefined;

    const flush = () => {
        if (text.length > 0) {
            result.push(transform(text.join('\n')));
            text = [];
        }
    };

    for (const line of markdown.split('\n')) {
        const match = line.match(FENCE);

        if (fence) {
            if (
                match &&
                match[1][0] === fence[0] &&
                match[1].length >= fence.length &&
                line.slice(match[0].length).trim() === ''
            ) {
                fence = undefined;
            }

            result.push(line);
        } else if (
            match &&
            !(match[1][0] === '`' && line.slice(match[0].length).includes('`'))
        ) {
            flush();
            fence = match[1];
            result.push(line);
        } else {
            text.push(line);
        }
    }

    flush();
    return result.join('\n');
};

// Turns images and other media into links, leaving code untouched. Telegram
// rejects the whole rich message if it can't fetch any of its media.
export const removeMedia = (markdown: string) =>
    mapText(markdown, removeInlineMedia);

const REFERENCE_DEFINITION =
    /^ {0,3}\[((?:[^\]\\\n]|\\.)+)\]:[ \t]*(<[^>\n]*>|\S+)(?:[ \t]+("[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*\r?$/gm;
const INLINE_DESTINATION =
    /^(<[^>\n]*>|\S+)(?:\s+("[^"]*"|'[^']*'|\([^)]*\)))?$/;
const LINKED_IMAGE_TAG = /^(<a\b[^>]*>)\s*(<img\b[^>]*>)\s*<\/a\s*>/i;
const LINE_PREFIX = /^[ \t>]*(?:(?:[-*+]|\d+[.)])[ \t]+)?$/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/;

type Destination = { url: string; title?: string };

const normalizeLabel = (label: string) =>
    label.trim().replace(/\s+/g, ' ').toLowerCase();

const unescapeMarkdown = (text: string) =>
    text.replace(/\\([!-/:-@[-`{-~])/g, '$1');

const escapeHtml = (text: string) =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

// Values taken from HTML are already escaped, apart from stray characters.
const escapeHtmlAttribute = (value: string) =>
    value
        .replace(/&(?!(?:#\d+|#x[\da-f]+|[a-z]+);)/gi, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const parseDestination = (destination: string, title?: string) => ({
    url: unescapeMarkdown(destination.replace(/^<(.*)>$/, '$1')),
    title: title && unescapeMarkdown(title.slice(1, -1)),
});

const getReferences = (markdown: string) => {
    const references = new Map<string, Destination>();

    mapText(markdown, text => {
        for (const [, label, destination, title] of text.matchAll(
            REFERENCE_DEFINITION,
        )) {
            const key = normalizeLabel(label);
            if (!references.has(key)) {
                references.set(key, parseDestination(destination, title));
            }
        }

        return text;
    });

    return references;
};

// Resolves the `(destination "title")`, `[ref]` or empty target of a link or
// image with the given label.
const resolveTarget = (
    target: string,
    label: string,
    references: Map<string, Destination>,
): Destination | undefined => {
    if (target.startsWith('(')) {
        const match = target.slice(1, -1).trim().match(INLINE_DESTINATION);
        return match ? parseDestination(match[1], match[2]) : undefined;
    }

    const key = normalizeLabel(target.length > 2 ? target.slice(1, -1) : label);
    return key ? references.get(key) : undefined;
};

const formatFigure = (src: string, href: string, caption: string) =>
    `<figure><img src="${src}"/><figcaption><a href="${href}">${caption}</a></figcaption></figure>`;

// Parses `[![alt](src)](href)` at `start`.
const parseLinkedImage = (
    text: string,
    start: number,
    references: Map<string, Destination>,
) => {
    const imageStart = start + 1 + text.slice(start + 1).search(/\S|$/);
    if (!text.startsWith('![', imageStart)) {
        return;
    }

    const image = parseImage(text, imageStart);
    if (!image) {
        return;
    }

    const close = image.end + text.slice(image.end).search(/\S|$/);
    if (text[close] !== ']' || !/[([]/.test(text[close + 1] ?? '')) {
        return;
    }

    const targetEnd = findClosing(text, close + 1);
    if (targetEnd === -1) {
        return;
    }

    const src = resolveTarget(image.target, image.alt, references);
    const link = resolveTarget(
        text.slice(close + 1, targetEnd + 1),
        '',
        references,
    );
    if (!src || !link) {
        return;
    }

    return {
        html: formatFigure(
            escapeHtml(src.url),
            escapeHtml(link.url),
            escapeHtml(unescapeMarkdown(image.alt) || src.title || link.url),
        ),
        end: targetEnd + 1,
    };
};

// Parses `<a href="href"><img src="src"></a>` at `start`.
const parseLinkedImageTag = (text: string, start: number) => {
    const match = text
        .slice(start, start + MAX_BRACKET_LENGTH)
        .match(LINKED_IMAGE_TAG);
    if (!match) {
        return;
    }

    const href = getAttribute(match[1], 'href');
    const src = getAttribute(match[2], 'src');
    if (!href || !src) {
        return;
    }

    return {
        html: formatFigure(
            escapeHtmlAttribute(src),
            escapeHtmlAttribute(href),
            escapeHtmlAttribute(getAttribute(match[2], 'alt') || href),
        ),
        end: start + match[0].length,
    };
};

const captionInlineLinkedImages = (
    text: string,
    references: Map<string, Destination>,
) => {
    let result = '';
    let i = 0;

    while (i < text.length) {
        if (text[i] === '\\') {
            result += text.slice(i, i + 2);
            i += 2;
            continue;
        }

        if (text[i] === '`') {
            const end = codeSpanEnd(text, i);
            result += text.slice(i, end);
            i = end;
            continue;
        }

        const figure =
            text[i] === '['
                ? parseLinkedImage(text, i, references)
                : text[i] === '<'
                  ? parseLinkedImageTag(text, i)
                  : undefined;

        if (!figure) {
            result += text[i];
            i++;
            continue;
        }

        const lineStart = text.lastIndexOf('\n', i - 1) + 1;
        const prefix = text.slice(lineStart, i);
        const lineEnd = text.indexOf('\n', figure.end);
        const suffix = text.slice(
            figure.end,
            lineEnd === -1 ? undefined : lineEnd,
        );

        // Only linked images on their own line become blocks, so the
        // surrounding text isn't split up.
        if (!LINE_PREFIX.test(prefix) || suffix.trim() !== '') {
            result += text[i];
            i++;
            continue;
        }

        result += figure.html;
        i = figure.end;

        if (lineEnd !== -1) {
            result += text.slice(i, lineEnd + 1);
            i = lineEnd + 1;

            // An HTML block runs until a blank line, so end it before any
            // following text to keep that text's Markdown formatting.
            const nextLineEnd = text.indexOf('\n', i);
            const nextLine = text
                .slice(i, nextLineEnd === -1 ? undefined : nextLineEnd)
                .replace(/^[ \t>]*/, '');

            if (nextLine.trim() !== '' && !LIST_ITEM.test(nextLine)) {
                result += `${prefix.match(/^[ \t>]*/)![0].trimEnd()}\n`;
            }
        }
    }

    return result;
};

// Telegram shows images as separate blocks and drops links around them, so
// images that are links become images with the link in their caption.
export const captionLinkedImages = (markdown: string) => {
    const references = getReferences(markdown);
    return mapText(markdown, text =>
        captionInlineLinkedImages(text, references),
    );
};
