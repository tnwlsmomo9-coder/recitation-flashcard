export function toInitials(text) {
  return text
    .split(" ")
    .map(word => (word.length > 0 ? word[0] : word))
    .join(" ");
}
