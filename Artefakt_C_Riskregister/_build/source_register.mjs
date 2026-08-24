import { readFileSync } from 'node:fs';

const EXPECTED_HEADERS = ['source_ref', 'title', 'authority', 'url'];

export function parseSourceRegister(input) {
  const text = String(input).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Källregistret innehåller ett oavslutat citattecken');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) throw new Error('Källregistret är tomt');

  const headers = rows.shift();
  if (JSON.stringify(headers) !== JSON.stringify(EXPECTED_HEADERS)) {
    throw new Error(`Fel CSV-rubriker: ${headers.join(',')}`);
  }

  const seen = new Set();
  return rows.map((values, index) => {
    if (values.length !== EXPECTED_HEADERS.length) {
      throw new Error(`Fel antal fält på källregistrets rad ${index + 2}`);
    }
    const source = Object.fromEntries(EXPECTED_HEADERS.map((header, valueIndex) => [header, values[valueIndex]]));
    for (const header of EXPECTED_HEADERS) {
      if (!source[header].trim()) throw new Error(`Tomt ${header} på källregistrets rad ${index + 2}`);
    }
    if (seen.has(source.source_ref)) throw new Error(`Duplicerad source_ref: ${source.source_ref}`);
    seen.add(source.source_ref);
    if (/\s/.test(source.url)) throw new Error(`${source.source_ref}: URL innehåller blanktecken`);
    const url = new URL(source.url);
    if (url.protocol !== 'https:') throw new Error(`${source.source_ref}: URL måste använda HTTPS`);
    return source;
  });
}

export function readSourceRegister(path) {
  return parseSourceRegister(readFileSync(path, 'utf8'));
}

export function toEmbeddedSourceRegister(sources) {
  return Object.fromEntries(sources.map(source => [source.source_ref, {
    title: source.title,
    url: source.url,
    authority: source.authority,
  }]));
}
