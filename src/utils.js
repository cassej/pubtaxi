const BASE62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function toBase62(num) {
  if (num === 0) return BASE62_CHARS[0];
  let result = "";
  while (num > 0) {
    result = BASE62_CHARS[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result;
}

export function fromBase62(str) {
  let num = 0;
  for (let i = 0; i < str.length; i++) {
    num = num * 62 + BASE62_CHARS.indexOf(str[i]);
  }
  return num;
}
