const USER = String.raw`[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}`;

// The references GitHub links automatically. They may be wrapped in `_`
// emphasis, so `_` doesn't count as part of a word around them. See
// https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls
const REFERENCE = new RegExp(
    [
        String.raw`(?<![a-z\d/.-])(?<url>(?:https?:\/\/|www\.)[^\s<>|…]+)`,
        String.raw`(?<![a-z\d.+-])(?<email>[a-z\d][\w.+-]*@[a-z\d-]+(?:\.[a-z\d-]+)+)`,
        String.raw`(?<![a-z\d\x60/@])@(?<org>${USER})\/(?<team>[a-z\d][\w-]*)`,
        String.raw`(?<![a-z\d\x60/@])@(?<user>${USER})(?![a-z\d-])`,
        String.raw`(?<![a-z\d/.-])(?<owner>${USER})\/(?<repo>[\w.-]+)(?:#(?<repoIssue>[1-9]\d*)|@(?<repoSha>[\da-f]{7,40}))(?![a-z\d-])`,
        String.raw`(?<![a-z\d&#/-])(?:#|GH-)(?<issue>[1-9]\d*)(?![a-z\d-])`,
        String.raw`(?<![a-z\d@/])(?<sha>[\da-f]{40})(?![a-z\d])`,
    ].join('|'),
    'gi',
);
const VALID_URL = /^(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)*(?:[/?#:]|$)/i;
const URL_TRAILING_PUNCTUATION = /[?!.,:*_~'"]$/;
const URL_TRAILING_ENTITY = /&[a-z\d]+;$/i;

const count = (text: string, char: string) => text.split(char).length - 1;

// Drops trailing characters that are more likely punctuation than part of the
// URL, following GitHub Flavored Markdown.
const trimUrl = (url: string) => {
    for (;;) {
        if (URL_TRAILING_PUNCTUATION.test(url)) {
            url = url.slice(0, -1);
        } else if (url.endsWith(')') && count(url, '(') < count(url, ')')) {
            url = url.slice(0, -1);
        } else if (URL_TRAILING_ENTITY.test(url)) {
            url = url.replace(URL_TRAILING_ENTITY, '');
        } else {
            return url;
        }
    }
};

const escapeAttribute = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Uses numeric entities for characters that have a meaning in Markdown, so the
// text shows as is in both Markdown and HTML.
const escapeText = (text: string) =>
    text.replace(/[&<>"*_~`[\]|=$\\]/g, char => `&#${char.charCodeAt(0)};`);

const formatLink = (href: string, text: string) =>
    `<a href="${escapeAttribute(href)}">${escapeText(text)}</a>`;

/**
 * Turns the URLs, e-mail addresses, mentions, and issue and commit references
 * that GitHub links in `text` into HTML links. The rest of the text is passed
 * through `escape`.
 */
export const autolink = (
    text: string,
    repo: string,
    escape: (text: string) => string = text => text,
) => {
    let result = '';
    let index = 0;

    for (const match of text.matchAll(REFERENCE)) {
        const groups = match.groups!;
        let matched = match[0];
        let link: string | undefined;

        if (groups.url) {
            matched = trimUrl(groups.url);
            if (VALID_URL.test(matched) && !/^https?:\/\/$/i.test(matched)) {
                link = formatLink(
                    /^www\./i.test(matched) ? `http://${matched}` : matched,
                    matched,
                );
            }
        } else if (groups.email) {
            if (/[a-z\d]$/i.test(groups.email)) {
                link = formatLink(`mailto:${groups.email}`, groups.email);
            }
        } else if (groups.team) {
            link = formatLink(
                `https://github.com/orgs/${groups.org}/teams/${groups.team}`,
                matched,
            );
        } else if (groups.user) {
            link = formatLink(`https://github.com/${groups.user}`, matched);
        } else if (groups.repoIssue) {
            link = formatLink(
                `https://github.com/${groups.owner}/${groups.repo}/issues/${groups.repoIssue}`,
                matched,
            );
        } else if (groups.repoSha) {
            link = formatLink(
                `https://github.com/${groups.owner}/${groups.repo}/commit/${groups.repoSha}`,
                `${groups.owner}/${groups.repo}@${groups.repoSha.slice(0, 7)}`,
            );
        } else if (groups.issue) {
            link = formatLink(
                `https://github.com/${repo}/issues/${groups.issue}`,
                matched,
            );
        } else if (groups.sha) {
            link = formatLink(
                `https://github.com/${repo}/commit/${groups.sha}`,
                groups.sha.slice(0, 7),
            );
        }

        if (link) {
            result += `${escape(text.slice(index, match.index))}${link}`;
            index = match.index! + matched.length;
        }
    }

    return result + escape(text.slice(index));
};
