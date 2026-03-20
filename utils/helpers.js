import fs from "fs";


export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

 export const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

 export const isValidUrl = (value) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};