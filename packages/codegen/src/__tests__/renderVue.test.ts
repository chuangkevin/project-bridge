import { describe, it, expect } from 'vitest';
import { renderVue, vueFilename } from '../renderVue';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

const loginAst: SemanticUIAst = {
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'login-page', kind: 'page',
  root: {
    id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical', gap: 12 },
    style: { padding: 24 }, bindings: [], events: [], constraints: [],
    children: [
      { id: 'n_h', type: 'Heading', props: { content: 'Sign in', level: '1' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      { id: 'n_email', type: 'Input', props: { inputType: 'email', placeholder: 'Email' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      { id: 'n_submit', type: 'Button', props: { label: 'Sign in' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    ],
  },
};

describe('vueFilename', () => {
  it('PascalCases the artifactId and appends .vue', () => {
    expect(vueFilename('login-page')).toBe('LoginPage.vue');
    expect(vueFilename('home')).toBe('Home.vue');
    expect(vueFilename('list_page-2')).toBe('ListPage2.vue');
  });
});

describe('renderVue', () => {
  const out = renderVue(loginAst);
  it('returns the SFC filename + code', () => { expect(out.filename).toBe('LoginPage.vue'); expect(typeof out.code).toBe('string'); });
  it('wraps in a single <template> with NO <script>', () => {
    expect(out.code).toMatch(/^<template>/);
    expect(out.code).toMatch(/<\/template>\s*$/);
    expect(out.code).not.toContain('<script');
  });
  it('renders form/heading/input/button with classes', () => {
    expect(out.code).toContain('<form class="flex flex-col gap-[12px] p-[24px]">');
    expect(out.code).toContain('<h1>Sign in</h1>');
    expect(out.code).toContain('type="email"');
    expect(out.code).toContain('<button type="button">Sign in</button>');
  });
  it('single-root template (root element is the form)', () => {
    const body = out.code.replace(/^<template>\n?/, '').replace(/\n?<\/template>\s*$/, '');
    expect(body.trimStart().startsWith('<form')).toBe(true);
  });
});
