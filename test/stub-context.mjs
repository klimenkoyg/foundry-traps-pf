/* Общая заглушка 2D-холста для тестов рисования. */

/** Холст-заглушка: всё принимает, считает вызовы и ловит NaN в координатах и цветах. */
export function stubContext() {
  let calls = 0;
  const bad = [];
  const gradient = { addColorStop: (o, c) => { if (!Number.isFinite(o) || /NaN/.test(c)) bad.push(["stop", o, c]); } };
  return new Proxy(
    { globalAlpha: 1 },
    {
      get(target, prop) {
        if (prop === "calls") return calls;
        if (prop === "bad") return bad;
        if (prop in target) return target[prop];
        if (prop === "createRadialGradient" || prop === "createLinearGradient") {
          return (...args) => {
            if (args.some((a) => !Number.isFinite(a))) bad.push([prop, ...args]);
            return gradient;
          };
        }
        return (...args) => {
          calls++;
          if (args.some((a) => typeof a === "number" && !Number.isFinite(a))) bad.push([prop, ...args]);
        };
      },
      set(target, prop, value) {
        if ((typeof value === "string" && /NaN|undefined/.test(value)) || (typeof value === "number" && !Number.isFinite(value))) bad.push([prop, value]);
        target[prop] = value;
        return true;
      },
    },
  );
}
