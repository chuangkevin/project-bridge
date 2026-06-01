---
name: vue-tailwind-basics
description: When generating Vue 3 SFCs in design mode, use Tailwind utility classes only (no scoped CSS). Use semantic HTML elements.
metadata:
  type: tech-stack
  scope: design
---

# Vue 3 + Tailwind ground rules

- `<template>` only for M1 (no `<script setup>`)
- Tailwind utilities, no `<style>` blocks
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<form>`, etc.
- Inputs always have a `<label>` (or `aria-label`)
