import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Logger } from './logger.js';
import { TemplateRegistry } from './template-registry.js';

const logger = {
  debug() {}, info() {}, warn() {}, error() {}, event() {}, child() { return this; },
} as unknown as Logger;

describe('built-in workspace templates', () => {
  it('ships the instruction source required by every persona-enabled template', async () => {
    const templates = await TemplateRegistry.load(
      join(process.cwd(), 'src', 'workspaces', 'templates'),
      logger,
    );

    const personaTemplates = templates.list().filter((template) => template.injectPersona);
    expect(personaTemplates.map((template) => template.name)).toContain('alice-invest');
    expect(personaTemplates.map((template) => template.name)).toContain('alice-portfolio');
    for (const template of personaTemplates) {
      expect(
        existsSync(join(template.filesDir, 'instruction.md')),
        `${template.name} must ship files/instruction.md`,
      ).toBe(true);
    }
  });

  it('registers Alice Portfolio with durable goal guidance and read-only research skills', async () => {
    const templates = await TemplateRegistry.load(
      join(process.cwd(), 'src', 'workspaces', 'templates'),
      logger,
    );

    expect(templates.get('alice-portfolio')).toMatchObject({
      displayName: 'Alice Portfolio',
      description: 'Holistic goal-based wealth planning using read-only MeuPluggy holdings and research on real investments.',
      version: '1.1.0',
      injectTools: false,
      injectPersona: true,
      upgradeStrategy: 'managed-context',
      bundledSkills: expect.arrayContaining([
        'alice-portfolio',
        'alice-uta',
        'alice-analysis',
        'traderhub',
      ]),
    });

    const instructions = readFileSync(
      join(
        process.cwd(),
        'src',
        'workspaces',
        'templates',
        'alice-portfolio',
        'files',
        'instruction.md',
      ),
      'utf8',
    );
    expect(instructions).toContain('Você é uma IA informacional');
    expect(instructions).toContain('Não diga que é CFP®, C-Pro R');
    expect(instructions).toContain('Não emita recomendação definitiva enquanto faltarem');
    expect(instructions).toContain('Este workspace nunca envia, prepara, modifica ou cancela ordens');
  });
});
