import fs from "fs";
import path from "path";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

// Contrast ratio formula
function sRgbToLinear(c: number): number {
  const norm = c / 255;
  return norm <= 0.03928 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function getLuminance(r: number, g: number, b: number): number {
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

function getContrast(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const L1 = getLuminance(...rgb1);
  const L2 = getLuminance(...rgb2);
  const brighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (brighter + 0.05) / (darker + 0.05);
}

function runTest() {
  console.log("Running Task 5: Contrast Ratio Verification...\n");

  // 1. Placeholder 80% navy (#0F4C81 at 80% alpha) over white (#FFFFFF)
  // fg*a + bg*(1-a)
  // r = 15*0.8 + 255*0.2 = 12 + 51 = 63
  // g = 76*0.8 + 255*0.2 = 60.8 + 51 = 111.8 -> 112
  // b = 129*0.8 + 255*0.2 = 103.2 + 51 = 154.2 -> 154
  const placeholderRgb: [number, number, number] = [63, 112, 154];
  const whiteRgb: [number, number, number] = [255, 255, 255];
  const ratioPlaceholder = getContrast(placeholderRgb, whiteRgb);
  console.log(`Placeholder (80% Navy on White): ${ratioPlaceholder.toFixed(2)} : 1`);
  check("Placeholder on white passes WCAG AA (>= 4.5:1)", ratioPlaceholder >= 4.5);

  // 2. Success green #15803d on white (#FFFFFF)
  // rgb(21, 128, 61)
  const greenRgb: [number, number, number] = [21, 128, 61];
  const ratioGreen = getContrast(greenRgb, whiteRgb);
  console.log(`Success green (#15803d on White): ${ratioGreen.toFixed(2)} : 1`);
  check("Success green on white passes WCAG AA (>= 4.5:1)", ratioGreen >= 4.5);

  // 3. Dark text #78350f on amber background #fef3c7
  // text rgb(120, 53, 15), bg rgb(254, 243, 199)
  const darkAmberText: [number, number, number] = [120, 53, 15];
  const amberBg: [number, number, number] = [254, 243, 199];
  const ratioAmber = getContrast(darkAmberText, amberBg);
  console.log(`Dark text on amber (#78350f on #fef3c7): ${ratioAmber.toFixed(2)} : 1`);
  check("Dark text on amber passes WCAG AA (>= 4.5:1)", ratioAmber >= 4.5);

  // File checks
  const checkoutCode = fs.readFileSync(path.join(__dirname, "../app/CheckoutClientPage.tsx"), "utf8");
  check("CheckoutClientPage has placeholder-brand-navy/80", checkoutCode.includes("placeholder-brand-navy/80"));

  const globalsCss = fs.readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
  check("globals.css defines --color-brand-success: #15803d", globalsCss.includes("--color-brand-success: #15803d;"));
  check("globals.css defines --color-brand-warning: #92400e", globalsCss.includes("--color-brand-warning: #92400e;"));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runTest();
