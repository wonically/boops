/** Soft pastel avatar colors */
export const PASTEL_COLORS = [
  "#F8B4C8",
  "#B8D4F8",
  "#B8E8D4",
  "#E8D4F8",
  "#FFE0B0",
  "#D4F0E8",
  "#F8D0E0",
  "#C8E0F8",
];

export function randomPastel() {
  return PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
}

export function makeRoomCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
