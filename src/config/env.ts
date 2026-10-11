import 'dotenv/config';

/**
 * Reads an environment variable as an integer.
 * Returns `fallback` when the variable is unset or empty,
 * and throws when it is set to something that isn't an integer.
 */
const int = (name: string, fallback: number): number => {
  const rawValue = process.env[name];

  if (rawValue == undefined || rawValue.trim() === '') {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value)) {
    throw new Error(`Environment variable ${name} must be an integer, but got ${rawValue}`);
  }

  return value;
};

/**
 * Reads an environment variable as a string.
 * Returns `fallback` when the variable is unset or empty (whitespace only counts as empty).
 */
const str = (name: string, fallback: string): string => {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }

  return rawValue.trim();
};

/**
 * Reads a required environment variable as a string.
 * Throws when the variable is unset or empty, so the app fails at startup
 * instead of running with a missing secret or connection string.
 */
const requiredStr = (name: string): string => {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return rawValue;
};

const config = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: int('PORT', 3000),
} as const;

export { config };
