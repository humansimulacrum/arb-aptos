/**
 * Random float number
 * @param {Float} min
 * @param {Float} max
 * @param {Integer} decimalPlaces
 * @returns Random float number
 */
export const randomFloatInRange = (min, max, decimalPlaces) => {
  const rand = Math.random() * (max - min) + min;
  const power = Math.pow(10, decimalPlaces);

  return Math.floor(rand * power) / power;
};

/**
 * Random int number
 * @param {Integer} min
 * @param {Integer} max
 * @returns Random int number
 */
export const randomIntInRange = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1));
};

export const sleep = async (millis) =>
  new Promise((resolve) => setTimeout(resolve, millis));
