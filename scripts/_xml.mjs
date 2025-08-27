/**
 * scripts/_xml.mjs
 * XML helpers for ETL: robust XML -> JSON and text cleanup
 */
import { XMLParser } from 'fast-xml-parser';

/**
 * Parse XML string into JSON using robust options suitable for MITRE feeds
 */
export function parseXmlToJson(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    allowBooleanAttributes: true,
    removeNSPrefix: true,
    preserveOrder: false,
  });
  return parser.parse(xmlText);
}

/**
 * Strip markup and normalize whitespace from rich text/HTML
 */
export function stripMarkup(input) {
  if (input == null) return '';
  let s = String(input);
  // Remove tags
  s = s.replace(/</g, '<').replace(/>/g, '>').replace(/&/g, '&');
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/"/g, '"').replace(/'/g, "'");
  s = s.replace(/<[^>]+>/g, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
