import { ACCENTS } from './design-tokens';
import { competenceOrder } from '../_brand/color-system';
import { srgbHexToLinear, paletteStateForMask, semanticWeightsForCoordinate } from '../visual-lab/photonic-skin-ps04-m2/photonic-palette';
import { FIELD_LUT_SIZE, type LutSample } from '../visual-lab/photonic-skin-ps04-m2/photonic-field';
/** Material pigments are linear RGB. Existing light/exposure and ownership stay intact. */
export const EDITORIAL_PIGMENTS=competenceOrder.map(id=>srgbHexToLinear(ACCENTS[id].light));
export function editorialLut(mask:number):LutSample[]{
 const palette=paletteStateForMask(mask);
 return Array.from({length:FIELD_LUT_SIZE},(_,index)=>{
  const weights=semanticWeightsForCoordinate(index/FIELD_LUT_SIZE,palette);
  const color=[0,0,0] as [number,number,number];
  weights.forEach((weight,i)=>{for(let c=0;c<3;c++)color[c]+=EDITORIAL_PIGMENTS[i][c]*weight;});
  return {color,presence:palette.neutralOnly?0:1};
 });
}
