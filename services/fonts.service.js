export async function extractFonts(page) {
  return page.evaluate(() => {
    const fonts = new Set();

    document.querySelectorAll("*").forEach((el) => {
      const fontFamily = getComputedStyle(el).fontFamily;
      if (!fontFamily) return;

      fontFamily.split(",").forEach((font) => {
        const clean = font.replace(/["']/g, "").trim().toLowerCase();
        if (
          clean &&
          !["inherit", "initial", "unset", "sans-serif", "serif"].includes(clean)
        ) {
          fonts.add(clean);
        }
      });
    });

    return Array.from(fonts).slice(0, 10);
  });
}