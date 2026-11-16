import { Fragment } from "react";

/** Tiny, dependency-free, XSS-safe Markdown renderer (builds React elements). */

function inline(text, keyPrefix) {
  const parts = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) parts.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (m[2]) parts.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else parts.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const Markdown = ({ text }) => {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(<pre key={blocks.length}><code>{buf.join("\n")}</code></pre>);
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<h4 key={blocks.length} className="md-h">{inline(h[2], `h${blocks.length}`)}</h4>);
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={blocks.length}>{inline(buf.join(" "), `q${blocks.length}`)}</blockquote>);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={blocks.length}>
          {items.map((it, k) => <li key={k}>{inline(it, `l${blocks.length}-${k}`)}</li>)}
        </Tag>,
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    blocks.push(
      <p key={blocks.length}>
        {buf.map((b, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {inline(b, `p${blocks.length}-${k}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className="md">{blocks}</div>;
};

export default Markdown;
