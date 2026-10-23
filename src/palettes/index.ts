import type { Palette } from '../model';

const colors = [
  ['D001', 'Black', '#1A1A1A'], ['D002', 'Charcoal', '#3A3A3A'], ['D003', 'Slate', '#66717A'], ['D004', 'Silver', '#A7ADB0'],
  ['D005', 'White', '#FFFFFF'], ['D006', 'Ivory', '#FFF3D6'], ['D007', 'Sand', '#D8B98A'], ['D008', 'Brown', '#7A4B2A'],
  ['D009', 'Chestnut', '#9C5A3C'], ['D010', 'Terracotta', '#C96F4A'], ['D011', 'Coral', '#F07F6A'], ['D012', 'Red', '#D9363E'],
  ['D013', 'Crimson', '#9E1B32'], ['D014', 'Blush', '#F3A5B8'], ['D015', 'Peach', '#FFC08A'], ['D016', 'Orange', '#F28C28'],
  ['D017', 'Gold', '#E5B83D'], ['D018', 'Yellow', '#F7D64A'], ['D019', 'Lemon', '#FFF2A6'], ['D020', 'Olive', '#8A8F36'],
  ['D021', 'Lime', '#B7D84B'], ['D022', 'Green', '#4A9B55'], ['D023', 'Forest', '#22613A'], ['D024', 'Mint', '#86D7B0'],
  ['D025', 'Teal', '#269B98'], ['D026', 'Cyan', '#63C7D8'], ['D027', 'Sky', '#75B9E6'], ['D028', 'Blue', '#3976C6'],
  ['D029', 'Navy', '#1E3B73'], ['D030', 'Periwinkle', '#899BE6'], ['D031', 'Lavender', '#B7A4E5'], ['D032', 'Purple', '#754DA8'],
  ['D033', 'Plum', '#54264F'], ['D034', 'Magenta', '#C34E9B'], ['D035', 'Rose', '#D96B91'], ['D036', 'Khaki', '#B6A878'],
  ['D037', 'Warm Gray', '#827C73'], ['D038', 'Cool Gray', '#87939A'], ['D039', 'Cloud', '#D9E0E2'], ['D040', 'Cream', '#F8E4B2'],
  ['D041', 'Brick', '#A94336'], ['D042', 'Rust', '#B8542D'], ['D043', 'Mango', '#F6A83D'], ['D044', 'Honey', '#D89B24'],
  ['D045', 'Spring', '#7FBE45'], ['D046', 'Pine', '#397A51'], ['D047', 'Aqua', '#3BB9B1'], ['D048', 'Ocean', '#287E9F'],
  ['D049', 'Denim', '#41658F'], ['D050', 'Indigo', '#3F3B82'], ['D051', 'Orchid', '#9D6FC2'], ['D052', 'Berry', '#913E73'],
  ['D053', 'Wine', '#6B2746'], ['D054', 'Tan', '#C89C72'], ['D055', 'Mocha', '#8D674E'], ['D056', 'Chocolate', '#4E3025'],
] as const;

export const defaultPalette: Palette = {
  id: 'demo-v1',
  name: 'Demo 56 色测试色卡',
  version: '1.0.0',
  source: '自定义演示色卡；非零售色号，供开发测试使用',
  license: 'CC BY 4.0 compatible custom data; attribution: Pingdou project',
  verified: false,
  colors: colors.map(([code, name, hex]) => ({ code, name, hex })),
};

export const palettes: Palette[] = [defaultPalette];
