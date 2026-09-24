/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CSSPropertyRule, CSSKeyframesRule, CSSLayerBlockRule, CSSGroupingRule, CSSMediaRule, CSSSupportsRule, CSSImportRule, CSSRule } from '../CSSOM.ts';
import type { Rule, ASTAtRule, Declaration, MediaEnvironment } from '../types.ts';
import { PropertyRegistry, type PropertyDefinition } from '../PropertyRegistry.ts';
import { MediaParser } from '../MediaParser.ts';
import { supports } from '../parser-api.ts';
import { serialize } from '../serializer.ts';

/**
 * Discovers and resolves active @property and @keyframes definitions across stylesheets and layers.
 * css-cascade-5 § 6.4.3 #layer-ordering
 * css-properties-values-api-1 § 5 #determining-computed-value-of-registered-custom-property
 * css-animations-1 § 4 #keyframes
 */
export function collectActiveAtRules(
  ruleList: Rule[],
  layerDeclarationOrder: Map<string, number>,
  env?: Partial<MediaEnvironment> | undefined
): {
  activeProperties: Map<string, PropertyDefinition>;
  activeKeyframes: Map<string, CSSKeyframesRule>;
} {
  interface Candidate<T> {
    item: T;
    layerOrder: number;
    sourceOrder: number;
  }

  const propertyCandidates = new Map<string, Candidate<PropertyDefinition>>();
  const keyframesCandidates = new Map<string, Candidate<CSSKeyframesRule>>();
  let sourceOrder = 0;

  function winsOver<T>(candidate: Candidate<T>, existing: Candidate<T>): boolean {
    // css-cascade-5 § 6.4.3 #layer-ordering:
    // "At-rules that define named entities resolve conflicts according to cascade layers:
    // Rules in the same layer resolve by source order (latest wins).
    // Rules in later cascade layers override rules in earlier cascade layers.
    // Unlayered rules override layered rules."
    if (candidate.layerOrder === Infinity && existing.layerOrder !== Infinity) return true;
    if (candidate.layerOrder !== Infinity && existing.layerOrder === Infinity) return false;
    if (candidate.layerOrder !== Infinity && existing.layerOrder !== Infinity) {
      if (candidate.layerOrder > existing.layerOrder) return true;
      if (candidate.layerOrder < existing.layerOrder) return false;
    }
    return candidate.sourceOrder > existing.sourceOrder;
  }

  function walk(rules: ArrayLike<Rule | CSSRule | Declaration>, currentLayer?: string) {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (!r) continue;
      sourceOrder++;

      if (r instanceof CSSPropertyRule || ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'property')) {
        let name = '';
        let syntax: string | undefined;
        let inherits = false;
        let initialValue: string | undefined;

        if (r instanceof CSSPropertyRule) {
          name = r.name;
          syntax = r.syntax;
          inherits = r.inherits;
          initialValue = r.initialValue ?? undefined;
        }

        if (!name.startsWith('--')) continue;

        const definition: PropertyDefinition = {
          name,
          syntax: syntax || '*',
          inherits: Boolean(inherits),
          initialValue,
        };

        try {
          PropertyRegistry.validate(definition);
        } catch {
          continue; // descriptor error: ignored per spec
        }

        const layerOrder = currentLayer !== undefined && currentLayer !== null ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;
        const candidate: Candidate<PropertyDefinition> = { item: definition, layerOrder, sourceOrder };

        const existing = propertyCandidates.get(name);
        if (!existing || winsOver(candidate, existing)) {
          propertyCandidates.set(name, candidate);
        }
      } else if (r instanceof CSSKeyframesRule || ((r as ASTAtRule).type === 'at-rule' && ((r as ASTAtRule).name === 'keyframes' || (r as ASTAtRule).name === '-webkit-keyframes'))) {
        let name = '';
        let keyframesRule: CSSKeyframesRule | null = null;
        if (r instanceof CSSKeyframesRule) {
          name = r.name;
          keyframesRule = r;
        }

        if (!name || !keyframesRule) continue;

        const layerOrder = currentLayer !== undefined && currentLayer !== null ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;
        const candidate: Candidate<CSSKeyframesRule> = { item: keyframesRule, layerOrder, sourceOrder };

        const existing = keyframesCandidates.get(name);
        if (!existing || winsOver(candidate, existing)) {
          keyframesCandidates.set(name, candidate);
        }
      } else if (
        r instanceof CSSLayerBlockRule ||
        ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'layer' && (r as ASTAtRule).block)
      ) {
        const assigned = (r as { _assignedLayerName?: string })._assignedLayerName;
        const rawName = (r as CSSLayerBlockRule).name || serialize((r as ASTAtRule).prelude || []).trim();
        const layerName = assigned || (currentLayer ? (rawName ? `${currentLayer}.${rawName}` : currentLayer) : rawName);
        const childRules = (r instanceof CSSGroupingRule ? r.cssRules : (r as ASTAtRule).childRules) || [];
        walk(childRules, layerName);
      } else if (
        r instanceof CSSMediaRule ||
        ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'media')
      ) {
        const mediaText = r instanceof CSSMediaRule ? r.media.mediaText : serialize((r as ASTAtRule).prelude || []).trim();
        if (!mediaText || MediaParser.evaluate(mediaText, env)) {
          const childRules = (r instanceof CSSGroupingRule ? r.cssRules : (r as ASTAtRule).childRules) || [];
          walk(childRules, currentLayer);
        }
      } else if (
        r instanceof CSSSupportsRule ||
        ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'supports')
      ) {
        const cond = r instanceof CSSSupportsRule ? r.conditionText : serialize((r as ASTAtRule).prelude || []).trim();
        if (!cond || supports(cond)) {
          const childRules = (r instanceof CSSGroupingRule ? r.cssRules : (r as ASTAtRule).childRules) || [];
          walk(childRules, currentLayer);
        }
      } else if (
        r instanceof CSSImportRule ||
        ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'import')
      ) {
        const importedSheet = (r as CSSImportRule).styleSheet;
        if (importedSheet && importedSheet.cssRules) {
          const rawLayer = (r as CSSImportRule).layerName;
          const layerName = rawLayer !== null && rawLayer !== undefined
            ? (currentLayer ? (rawLayer ? `${currentLayer}.${rawLayer}` : currentLayer) : rawLayer)
            : currentLayer;
          walk(importedSheet.cssRules, layerName);
        }
      }
    }
  }

  walk(ruleList);

  const activeProperties = new Map<string, PropertyDefinition>();
  for (const [name, cand] of propertyCandidates) {
    activeProperties.set(name, cand.item);
  }

  const activeKeyframes = new Map<string, CSSKeyframesRule>();
  for (const [name, cand] of keyframesCandidates) {
    activeKeyframes.set(name, cand.item);
  }

  return { activeProperties, activeKeyframes };
}
