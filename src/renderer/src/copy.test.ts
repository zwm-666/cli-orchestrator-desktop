import { describe, it, expect } from 'vitest';
import { COPY, RUN_STATUS_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS, LOCALES } from './copy.js';

describe('COPY', () => {
  it('has matching keys between en and zh locales', () => {
    const enKeys = Object.keys(COPY.en).sort();
    const zhKeys = Object.keys(COPY.zh).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('has no empty values in en locale', () => {
    for (const [key, value] of Object.entries(COPY.en)) {
      expect(value, `COPY.en.${key} should not be empty`).not.toBe('');
    }
  });

  it('has no empty values in zh locale', () => {
    for (const [key, value] of Object.entries(COPY.zh)) {
      expect(value, `COPY.zh.${key} should not be empty`).not.toBe('');
    }
  });
});

describe('RUN_STATUS_LABELS', () => {
  it('covers all locales', () => {
    for (const locale of LOCALES) {
      expect(RUN_STATUS_LABELS[locale]).toBeTruthy();
    }
  });

  it('has all status keys in both locales', () => {
    const enKeys = Object.keys(RUN_STATUS_LABELS.en).sort();
    const zhKeys = Object.keys(RUN_STATUS_LABELS.zh).sort();
    expect(enKeys).toEqual(zhKeys);
  });
});

describe('TASK_STATUS_LABELS', () => {
  it('has matching keys across locales', () => {
    const enKeys = Object.keys(TASK_STATUS_LABELS.en).sort();
    const zhKeys = Object.keys(TASK_STATUS_LABELS.zh).sort();
    expect(enKeys).toEqual(zhKeys);
  });
});

describe('TASK_TYPE_LABELS', () => {
  it('has matching keys across locales', () => {
    const enKeys = Object.keys(TASK_TYPE_LABELS.en).sort();
    const zhKeys = Object.keys(TASK_TYPE_LABELS.zh).sort();
    expect(enKeys).toEqual(zhKeys);
  });
});
