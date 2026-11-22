// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), arrayBuffer: vi.fn() }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));

const readBytes = Blob.prototype.arrayBuffer;
const byteReadDescriptor = Object.getOwnPropertyDescriptor(Blob.prototype, 'arrayBuffer')!;
Object.defineProperty(Blob.prototype, 'arrayBuffer', {
  ...byteReadDescriptor,
  value: function (this: Blob) {
    return mocks.arrayBuffer(this) ?? Reflect.apply(readBytes, this, []);
  },
});
const { defineFormAction } = await import('./safe-action');
const { buildInputGuard } = await import('./safe-action.guard');
Object.defineProperty(Blob.prototype, 'arrayBuffer', byteReadDescriptor);

function upload(bytes = 'abc', type = 'image/png') {
  const file = new File([bytes], 'image.png', { type, lastModified: 123 });
  const form = new FormData();
  form.append('file', file);
  return { file, form };
}

function slot(file: File, name: string) {
  const key = Object.getOwnPropertySymbols(file).find(symbol => symbol.description === name);
  if (!key) throw new Error(`Node File has no ${name} slot`);
  return key;
}

const actionFor = (file = z.file().check(z.size(3), z.mime(['image/png']))) =>
  defineFormAction({
    name: 'guard.upload',
    basis: { kind: 'role', roles: ['staff'] },
    input: z.strictObject({ file }),
    subject: { type: 'none' },
    handler: async input => input.file,
  });

describe('private File bytes and descriptors', () => {
  beforeEach(() => {
    mocks.authorize.mockReset().mockResolvedValue(authorizedSession(STAFF_A));
    mocks.arrayBuffer.mockReset();
  });

  it('refuses four backing bytes with a stored length of three', async () => {
    const { file, form } = upload('abcd');
    Object.defineProperty(file, slot(file, 'kLength'), { value: 3 });
    expect(file.size).toBe(3);
    expect(await actionFor()(undefined, form)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects inconsistent File size even when the schema accepts all backing bytes', async () => {
    const { file, form } = upload('abcd');
    const action = actionFor(z.file().check(z.size(4)));
    expect(await action(undefined, form)).toMatchObject({ success: true });
    Object.defineProperty(file, slot(file, 'kLength'), { value: 3 });
    expect(await action(undefined, form)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('reads and copies one File once across repeated form references', async () => {
    const { file, form } = upload();
    form.append('repeated', file);
    form.append('repeated', file);
    const action = defineFormAction({
      name: 'guard.repeated-upload',
      basis: { kind: 'role', roles: ['staff'] },
      subject: { type: 'none' },
      input: z.strictObject({ file: z.file(), repeated: z.array(z.file()) }),
      handler: async value => value,
    });
    const result = await action(undefined, form);
    expect(mocks.arrayBuffer).toHaveBeenCalledExactlyOnceWith(file);
    if (!result.success || !result.data) throw new Error('missing upload');
    expect(result.data.file).not.toBe(file);
    expect(result.data.repeated[0]).toBe(result.data.file);
    expect(result.data.repeated[1]).toBe(result.data.file);
  });

  it.each([false, true])(
    'rejects Files without reading bytes for a File-free definition (form=%s)',
    async form => {
      const uploadInput = upload();
      const guard = buildInputGuard(z.strictObject({ field: z.string().optional() }), {
        operation: 'guard.no-upload',
        basisKind: 'role',
        subjectFrom: null,
        form,
      });
      expect(
        await guard.run(form ? uploadInput.form : { file: uploadInput.file }, form)
      ).toMatchObject({
        kind: 'invalid',
        snapshot: null,
      });
      expect(mocks.arrayBuffer).not.toHaveBeenCalled();
    }
  );

  it.each(['ab', 'abcd'])(
    'refuses real bytes %s outside the exact three-byte check',
    async bytes => {
      const { form } = upload(bytes);
      expect(await actionFor()(undefined, form)).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  );

  it('refuses a handle-shaped ordinary object in place of the native handle', async () => {
    const { file, form } = upload();
    const key = slot(file, 'kHandle');
    const original: unknown = Reflect.get(file, key);
    Object.defineProperty(file, key, { value: Object.create(Object.getPrototypeOf(original)) });
    expect(await actionFor()(undefined, form)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('copies a three-byte upload with equal bytes, size and metadata and independent own properties', async () => {
    const { file, form } = upload();
    const result = await actionFor()(undefined, form);
    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error('missing upload');
    const copy = result.data;
    expect(copy).not.toBe(file);
    const bytes = await copy.arrayBuffer();
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(copy.size).toBe(bytes.byteLength);
    expect(copy.size).toBe(file.size);
    expect([copy.name, copy.type, copy.lastModified]).toEqual([
      file.name,
      file.type,
      file.lastModified,
    ]);
    Object.defineProperty(copy, 'copyOnly', { value: true });
    Object.defineProperty(file, 'originalOnly', { value: true });
    expect(Object.hasOwn(file, 'copyOnly')).toBe(false);
    expect(Object.hasOwn(copy, 'originalOnly')).toBe(false);
  });

  it.each([
    'a bigint modification time',
    'an inherited name',
    'an accessor name',
    'an object name',
  ])('refuses %s without reading bytes, invoking a getter or converting a name', async kind => {
    const { file, form } = upload();
    const state: object = Reflect.get(file, slot(file, 'state'));
    const spy = vi.fn(() => 'image.png');
    if (kind === 'a bigint modification time')
      Object.defineProperty(state, 'lastModified', { value: 123n });
    if (kind === 'an inherited name')
      Object.setPrototypeOf(state, Object.defineProperty({}, 'name', { get: spy }));
    if (kind === 'an accessor name') Object.defineProperty(state, 'name', { get: spy });
    if (kind === 'an object name')
      Object.defineProperty(state, 'name', { value: { toString: spy } });
    expect(await actionFor()(undefined, form)).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(mocks.arrayBuffer).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('never reads the caller length accessor installed while the byte read is pending', async () => {
    const { file, form } = upload();
    const bytes = await file.arrayBuffer();
    let complete!: (bytes: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>(resolve => {
      complete = resolve;
    });
    let started!: () => void;
    const reading = new Promise<void>(resolve => {
      started = resolve;
    });
    mocks.arrayBuffer.mockImplementation(() => {
      started();
      return pending;
    });
    const result = actionFor()(undefined, form);
    await Promise.race([reading, result]);
    expect(mocks.arrayBuffer).toHaveBeenCalledOnce();
    const length = vi.fn(() => 3);
    Object.defineProperty(file, slot(file, 'kLength'), { get: length });
    complete(bytes);
    expect(await result).toMatchObject({ success: true });
    expect(length).not.toHaveBeenCalled();
  });

  it('refuses a temporary own MIME override added during authentication', async () => {
    const { file, form } = upload('abc', 'application/pdf');
    mocks.authorize.mockImplementationOnce(async () => {
      Object.defineProperty(file, 'type', { value: 'image/png' });
      return authorizedSession(STAFF_A);
    });
    expect(await actionFor()(undefined, form)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('enforces the PNG MIME check on an otherwise valid three-byte PDF', async () => {
    const { form } = upload('abc', 'application/pdf');
    expect(await actionFor(z.file().check(z.size(3)))(undefined, form)).toMatchObject({
      success: true,
    });
    expect(await actionFor()(undefined, form)).toMatchObject({
      code: 'VALIDATION_ERROR',
      issues: { file: 'invalid_value' },
    });
  });

  it.each(['string', 'symbol'])('refuses an extra %s key on a File', async kind => {
    const { file, form } = upload();
    Object.defineProperty(file, kind === 'symbol' ? Symbol('extra') : 'extra', { value: true });
    expect(await actionFor()(undefined, form)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('refuses a proxy File without reaching a trap', async () => {
    const { file } = upload();
    const trap = vi.fn(() => {
      throw new Error('proxy trap');
    });
    const proxy = new Proxy(file, { get: trap, ownKeys: trap, getPrototypeOf: trap });
    const guard = buildInputGuard(z.strictObject({ file: z.file() }), {
      operation: 'guard.file',
      basisKind: 'role',
      form: true,
      subjectFrom: null,
    });
    expect(await guard.run({ file: proxy }, false)).toMatchObject({ kind: 'invalid' });
    expect(await guard.run({ file: new Blob(['abc']) }, false)).toMatchObject({ kind: 'invalid' });
    expect(trap).not.toHaveBeenCalled();
  });

  it('collects fields through the FormData intrinsic even with an own entries override', async () => {
    const { form } = upload();
    const entries = vi.fn(() => new FormData().entries());
    Object.defineProperty(form, 'entries', { value: entries });
    expect(await actionFor()(undefined, form)).toMatchObject({ success: true });
    expect(entries).not.toHaveBeenCalled();
  });

  it('rejects form input with a proxy in its prototype chain without invoking a trap', async () => {
    const trap = vi.fn(() => {
      throw new Error('proxy trap');
    });
    const raw = Object.create(new Proxy({}, { getPrototypeOf: trap }));
    expect(await actionFor()(undefined, raw)).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(trap).not.toHaveBeenCalled();
  });
});
