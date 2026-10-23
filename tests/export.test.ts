import { describe, it, expect } from 'vitest';
import { parseProject, csvText } from '../src/export';
import { defaultPalette } from '../src/palettes';
import { defaultSettings, EMPTY, type Project } from '../src/model';
function project():Project{return {schemaVersion:1,id:'test',title:'测试作品',source:null,settings:{...defaultSettings},pattern:{width:2,height:2,cells:[0,0,1,EMPTY],palette:structuredClone(defaultPalette),settings:{...defaultSettings},algorithmVersion:'test',durationMs:1},edited:false,updatedAt:new Date().toISOString()};}
describe('project validation',()=>{
 it('round trips an editable project',()=>{const p=project();expect(parseProject(JSON.stringify(p))).toEqual(p);});
 it('rejects wrong matrix length',()=>{const p=project();p.pattern!.cells.pop();expect(()=>parseProject(JSON.stringify(p))).toThrow();});
 it('rejects out-of-palette indices',()=>{const p=project();p.pattern!.cells[0]=900;expect(()=>parseProject(JSON.stringify(p))).toThrow();});
 it('rejects executable source data',()=>{const p=project();p.source={name:'x',width:1,height:1,dataUrl:'data:image/svg+xml,<svg/>'};expect(()=>parseProject(JSON.stringify(p))).toThrow();});
 it('accepts manual edits exceeding generated budget',()=>{const p=project();p.pattern!.settings.maxColors=1;p.edited=true;expect(parseProject(JSON.stringify(p)).pattern!.cells).toEqual(p.pattern!.cells);});
 it('rejects unsupported oversized dimensions',()=>{const p=project();p.pattern!.width=1000;expect(()=>parseProject(JSON.stringify(p))).toThrow();});
});
describe('CSV supply calculation',()=>{
 it('includes UTF8 BOM and explicit pack count',()=>{const text=csvText(project().pattern!,5,2);expect(text.startsWith('\ufeff')).toBe(true);expect(text).toContain('建议包数');expect(text).toContain('测试色卡');expect(text).toContain('"2","1","3","2","2"');});
 it('does not invent a package quantity',()=>{const text=csvText(project().pattern!,0,null);expect(text).toContain('"2","0","2","",""');});
 it('escapes spreadsheet formulas and embedded quotes',()=>{const p=project();p.pattern!.palette.colors[0].name='=SUM("bad")';expect(csvText(p.pattern!,0,null)).toContain(`"'=SUM(""bad"")"`);});
});
