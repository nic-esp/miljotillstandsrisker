#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRiskRegistry } from './risk-service.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = path => JSON.parse(readFileSync(join(here, path), 'utf8'));

const registry = createRiskRegistry({
  risks: readJson('../Artefakt_C_riskregister.json'),
  nodesByChart: readJson('../_build/mappable_nodes.json'),
  sources: readJson('./data/sources.json'),
  processCharts: readJson('../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json'),
});

const server = registry.createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
