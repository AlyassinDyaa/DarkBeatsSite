import { brand } from '../data/site'

/* The whole site is tinted by one number, --h (a hue, 0–360), set in the admin panel
   (Name, colour and contact → Brand colour). */
export const applyBrandHue = () => document.documentElement.style.setProperty('--h', String(brand.hue))
