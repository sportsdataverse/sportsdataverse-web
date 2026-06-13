// Next 16 removed `next lint`; this is the flat ESLint config. We use
// @next/eslint-plugin-next's native flat `core-web-vitals` config directly
// (the full eslint-config-next bundle trips a circular-config bug under
// FlatCompat). Expand with typescript-eslint / react-hooks flat configs later.
import nextPlugin from "@next/eslint-plugin-next";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "public/**", "out/**"] },
  nextPlugin.configs["core-web-vitals"],
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
