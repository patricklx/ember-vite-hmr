import js from "@eslint/js";
import prettier from "eslint-plugin-prettier";
import n from "eslint-plugin-n";
import babelParser from "@babel/eslint-parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    ignores: [
      "dist/",
      "node_modules/",
      "declarations/",
      "coverage/",
      "tmp/",
      ".git/",
      "**/*.json",
      "**/*.d.ts",
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaVersion: "latest",
        sourceType: "module",
        babelOptions: {
          plugins: [
            ["@babel/plugin-proposal-decorators", { legacy: true }],
            "@babel/plugin-proposal-class-properties",
          ],
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      "prettier/prettier": "error",
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "prettier/prettier": "error",
    },
  },
  {
    files: ["lib/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "prettier/prettier": "error",
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "prettier/prettier": "error",
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaVersion: "latest",
        sourceType: "module",
        babelOptions: {
          plugins: [
            ["@babel/plugin-proposal-decorators", { legacy: true }],
            "@babel/plugin-proposal-class-properties",
          ],
        },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      "prettier/prettier": "error",
    },
  },
  {
    files: [
      ".eslintrc.cjs",
      ".prettierrc.cjs",
      ".template-lintrc.cjs",
      "addon-main.cjs",
      "eslint.config.js",
    ],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      n,
    },
  },
  {
    files: ["rollup.config.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      n,
    },
  },
];