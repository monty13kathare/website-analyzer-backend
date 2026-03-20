export async function extractColors(page) {
  return page.evaluate(() => {
    const set = new Set();

    document.querySelectorAll("*").forEach((el) => {
      const s = getComputedStyle(el);
      if (s.color?.startsWith("rgb")) set.add(s.color);
      if (s.backgroundColor?.startsWith("rgb")) set.add(s.backgroundColor);
    });

    return [...set].slice(0, 25).map((rgb) => {
      const m = rgb.match(/\d+/g);
      return (
        "#" +
        m.map((x) => Number(x).toString(16).padStart(2, "0")).join("")
      );
    });
  });
}