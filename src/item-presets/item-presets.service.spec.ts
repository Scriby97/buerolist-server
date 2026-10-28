import { ItemPresetsService } from './item-presets.service';
import { ItemPresetEntity } from './item-preset.entity';

describe('ItemPresetsService', () => {
  const repo = {
    maximum: jest.fn(),
    create: jest.fn((v: Partial<ItemPresetEntity>) => v),
    save: jest.fn((v: Partial<ItemPresetEntity>) => Promise.resolve(v)),
  };
  const service = new ItemPresetsService(repo as never);

  beforeEach(() => jest.clearAllMocks());

  it('nummeriert pro Organisation und Typ fortlaufend', async () => {
    repo.maximum.mockResolvedValue(3);
    const saved = await service.create({
      organizationId: 'org-1',
      type: 'expense',
      description: ' Parkieren ',
      unitPriceRappen: 500,
    });
    expect(repo.maximum).toHaveBeenCalledWith('number', {
      organizationId: 'org-1',
      type: 'expense',
    });
    expect(saved).toMatchObject({ number: 4, description: 'Parkieren' });
  });

  it('erste Vorlage eines Typs bekommt Nummer 1, Preis ist optional', async () => {
    repo.maximum.mockResolvedValue(null);
    const saved = await service.create({
      organizationId: 'org-1',
      type: 'material',
      description: 'Kitt',
    });
    expect(saved).toMatchObject({ number: 1, unitPriceRappen: null });
  });
});
