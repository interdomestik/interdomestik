function isAsciiLetterOrDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

function isSeparator(char: string): boolean {
  return char === '-' || char === '_' || char.trim() === '';
}

export function branchSlugFromName(name: string): string {
  let slug = '';
  let pendingSeparator = false;

  for (const char of name.toLowerCase().trim()) {
    if (isAsciiLetterOrDigit(char)) {
      if (pendingSeparator && slug) slug += '-';
      slug += char;
      pendingSeparator = false;
      continue;
    }

    if (isSeparator(char)) {
      pendingSeparator = true;
    }
  }

  return slug;
}
