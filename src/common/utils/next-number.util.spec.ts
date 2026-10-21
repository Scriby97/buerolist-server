import { saveWithNextNumber } from './next-number.util';

describe('saveWithNextNumber', () => {
  it('vergibt hoechste Nummer + 1 (bzw. 1 ohne bisherige)', async () => {
    const save = jest.fn((n: number) => Promise.resolve(n));
    await expect(
      saveWithNextNumber(() => Promise.resolve(7), save),
    ).resolves.toBe(8);
    await expect(
      saveWithNextNumber(() => Promise.resolve(null), save),
    ).resolves.toBe(1);
  });

  it('versucht es bei einer Nummern-Kollision mit neu berechneter Nummer nochmals', async () => {
    const max = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    const save = jest
      .fn()
      .mockRejectedValueOnce({ driverError: { code: '23505' } })
      .mockImplementation((n: number) => Promise.resolve(n));
    await expect(saveWithNextNumber(max, save)).resolves.toBe(5);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('wirft andere Fehler sofort weiter', async () => {
    const save = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(
      saveWithNextNumber(() => Promise.resolve(1), save),
    ).rejects.toThrow('boom');
    expect(save).toHaveBeenCalledTimes(1);
  });
});
