import { describe, expect, it, vi } from 'vitest'
import { migration } from './index.js'
describe('0027 Alice Invest readiness evidence',()=>it('seeds only an absent journal',async()=>{const writeJson=vi.fn();await migration.up({readJson:vi.fn().mockResolvedValue(undefined),writeJson,removeJson:vi.fn(),configDir:()=>'/config'});expect(writeJson).toHaveBeenCalledWith('alice-invest-readiness-evidence.json',{version:1,entries:[]})}))
