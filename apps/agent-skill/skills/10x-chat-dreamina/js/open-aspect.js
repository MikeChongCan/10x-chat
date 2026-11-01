() => {
  const button = [...document.querySelectorAll('button.lv-btn')].find(
    (el) =>
      !el.hidden &&
      getComputedStyle(el).display !== 'none' &&
      /(?:21:9|16:9|4:3|1:1|3:4|9:16)/.test(el.textContent),
  );
  if (!button || button.disabled) return { ok: false };
  button.click();
  return { ok: true };
};
