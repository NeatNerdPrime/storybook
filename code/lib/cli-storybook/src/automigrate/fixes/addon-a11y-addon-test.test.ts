import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatFileContent } from '@storybook/core/common';

import { formatConfig, loadConfig } from '@storybook/core/csf-tools';

import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as jscodeshift from 'jscodeshift';
import path from 'path';
import dedent from 'ts-dedent';

import { getAddonNames } from '../helpers/mainConfigFile';
import {
  addonA11yAddonTest,
  transformPreviewFile,
  transformSetupFile,
} from './addon-a11y-addon-test';

vi.mock('../helpers/mainConfigFile', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  return {
    ...mod,
    getAddonNames: vi.fn(),
  };
});

// mock fs.existsSync
vi.mock('fs', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  return {
    ...mod,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('picocolors', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  return {
    ...mod,
    default: {
      gray: (s: string) => s,
      green: (s: string) => s,
      cyan: (s: string) => s,
      magenta: (s: string) => s,
    },
  };
});

const j = jscodeshift.withParser('ts');

describe('addonA11yAddonTest', () => {
  const configDir = '/path/to/config';
  const mainConfig = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('check', () => {
    it('should return null if a11y addon is not present', async () => {
      vi.mocked(getAddonNames).mockReturnValue([]);
      const result = await addonA11yAddonTest.check({ mainConfig, configDir } as any);
      expect(result).toBeNull();
    });

    it('should return null if test addon is not present', async () => {
      vi.mocked(getAddonNames).mockReturnValue(['@storybook/addon-a11y']);
      const result = await addonA11yAddonTest.check({ mainConfig, configDir } as any);
      expect(result).toBeNull();
    });

    it('should return null if configDir is not provided', async () => {
      const result = await addonA11yAddonTest.check({ mainConfig, configDir: '' } as any);
      expect(result).toBeNull();
    });

    it('should return null if provided framework is not supported', async () => {
      vi.mocked(getAddonNames).mockReturnValue([
        '@storybook/addon-a11y',
        '@storybook/experimental-addon-test',
      ]);
      const result = await addonA11yAddonTest.check({
        mainConfig: {
          framework: '@storybook/angular',
        },
        configDir: '',
      } as any);
      expect(result).toBeNull();
    });

    it('should return null if vitest.setup file and preview file have the necessary transformations', async () => {
      vi.mocked(getAddonNames).mockReturnValue([
        '@storybook/addon-a11y',
        '@storybook/experimental-addon-test',
      ]);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (p.toString().includes('vitest.setup')) {
          return `
            import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
            import { beforeAll } from 'vitest';
            import { setProjectAnnotations } from 'storybook';
            import * as projectAnnotations from './preview';

            const project = setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

            beforeAll(project.beforeAll);
          `;
        } else {
          return `
            export default {
              tags: ['a11y-test'],
            }
          `;
        }
      });

      const result = await addonA11yAddonTest.check({
        mainConfig: {
          framework: '@storybook/react-vite',
        },
        configDir,
      } as any);
      expect(result).toBeNull();
    });

    it('should return setupFile and transformedSetupCode if vitest.setup file exists', async () => {
      vi.mocked(getAddonNames).mockReturnValue([
        '@storybook/addon-a11y',
        '@storybook/experimental-addon-test',
      ]);
      vi.mocked(existsSync).mockImplementation((p) => {
        if (p.toString().includes('vitest.setup')) {
          return true;
        } else {
          return false;
        }
      });
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (p.toString().includes('vitest.setup')) {
          return 'const annotations = setProjectAnnotations([]);';
        } else {
          return '';
        }
      });

      const result = await addonA11yAddonTest.check({
        mainConfig: {
          framework: '@storybook/react-vite',
        },
        configDir,
      } as any);
      expect(result).toEqual({
        setupFile: path.join(configDir, 'vitest.setup.js'),
        previewFile: null,
        transformedPreviewCode: null,
        transformedSetupCode: expect.any(String),
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: false,
      });
    });

    it('should return previewFile and transformedPreviewCode if preview file exists', async () => {
      vi.mocked(getAddonNames).mockReturnValue([
        '@storybook/addon-a11y',
        '@storybook/experimental-addon-test',
      ]);
      vi.mocked(existsSync).mockImplementation((p) => {
        if (p.toString().includes('preview')) {
          return true;
        } else {
          return false;
        }
      });
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (p.toString().includes('preview')) {
          return 'export default {}';
        } else {
          return '';
        }
      });

      const result = await addonA11yAddonTest.check({
        mainConfig: {
          framework: '@storybook/react-vite',
        },
        configDir,
      } as any);
      expect(result).toEqual({
        setupFile: null,
        previewFile: path.join(configDir, 'preview.js'),
        transformedPreviewCode: expect.any(String),
        transformedSetupCode: null,
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: false,
      });
    });

    it('should return setupFile and null transformedSetupCode if transformation fails', async () => {
      vi.mocked(getAddonNames).mockReturnValue([
        '@storybook/addon-a11y',
        '@storybook/experimental-addon-test',
      ]);
      vi.mocked(existsSync).mockImplementation((p) => {
        if (p.toString().includes('vitest.setup')) {
          return true;
        } else {
          return false;
        }
      });
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (p.toString().includes('vitest.setup')) {
          throw new Error('Test error');
        } else {
          return '';
        }
      });

      const result = await addonA11yAddonTest.check({
        mainConfig: {
          framework: '@storybook/sveltekit',
        },
        configDir,
      } as any);
      expect(result).toEqual({
        setupFile: path.join(configDir, 'vitest.setup.js'),
        previewFile: null,
        transformedPreviewCode: null,
        transformedSetupCode: null,
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: false,
      });
    });

    it('should return previewFile and null transformedPreviewCode if transformation fails', async () => {
      vi.mocked(getAddonNames).mockReturnValue([
        '@storybook/addon-a11y',
        '@storybook/experimental-addon-test',
      ]);
      vi.mocked(existsSync).mockImplementation((p) => {
        if (p.toString().includes('preview')) {
          return true;
        } else {
          return false;
        }
      });
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (p.toString().includes('preview')) {
          throw new Error('Test error');
        } else {
          return '';
        }
      });

      const result = await addonA11yAddonTest.check({
        mainConfig: {
          framework: '@storybook/sveltekit',
        },
        configDir,
      } as any);
      expect(result).toEqual({
        setupFile: null,
        previewFile: path.join(configDir, 'preview.js'),
        transformedPreviewCode: null,
        transformedSetupCode: null,
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: false,
      });
    });

    it('should return skipPreviewTransformation=true if preview file has the necessary change', async () => {
      vi.mocked(getAddonNames).mockReturnValue([
        '@storybook/addon-a11y',
        '@storybook/experimental-addon-test',
      ]);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (p.toString().includes('vitest.setup')) {
          return `
            import { beforeAll } from 'vitest';
            import { setProjectAnnotations } from 'storybook';
            import * as projectAnnotations from './preview';

            const project = setProjectAnnotations([projectAnnotations]);

            beforeAll(project.beforeAll);
          `;
        } else {
          return `
            export default {
              tags: ['a11y-test'],
            }
          `;
        }
      });

      const result = await addonA11yAddonTest.check({
        mainConfig: {
          framework: '@storybook/sveltekit',
        },
        configDir,
      } as any);
      expect(result).toEqual({
        setupFile: path.join(configDir, 'vitest.setup.js'),
        previewFile: path.join(configDir, 'preview.js'),
        transformedPreviewCode: null,
        transformedSetupCode: expect.any(String),
        skipPreviewTransformation: true,
        skipVitestSetupTransformation: false,
      });
    });

    it('should return skipVitestSetupTransformation=true if setup file has the necessary change', async () => {
      vi.mocked(getAddonNames).mockReturnValue([
        '@storybook/addon-a11y',
        '@storybook/experimental-addon-test',
      ]);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (p.toString().includes('vitest.setup')) {
          return `
            import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
            import { beforeAll } from 'vitest';
            import { setProjectAnnotations } from 'storybook';
            import * as projectAnnotations from './preview';

            const project = setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

            beforeAll(project.beforeAll);
          `;
        } else {
          return `
            export default {
              tags: [],
            }
          `;
        }
      });

      const result = await addonA11yAddonTest.check({
        mainConfig: {
          framework: '@storybook/sveltekit',
        },
        configDir,
      } as any);
      expect(result).toEqual({
        setupFile: path.join(configDir, 'vitest.setup.js'),
        previewFile: path.join(configDir, 'preview.js'),
        transformedPreviewCode: expect.any(String),
        transformedSetupCode: null,
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: true,
      });
    });
  });

  describe('prompt', () => {
    it('should return manual prompt if transformedSetupCode is null and if transformedPreviewCode is null', () => {
      const result = addonA11yAddonTest.prompt({
        setupFile: null,
        transformedSetupCode: null,
        previewFile: null,
        transformedPreviewCode: null,
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: false,
      });
      expect(result).toMatchSnapshot();
    });

    it('should return auto prompt if transformedSetupCode is null and if transformedPreviewCode is defined', () => {
      const result = addonA11yAddonTest.prompt({
        setupFile: null,
        transformedSetupCode: null,
        previewFile: 'preview.js',
        transformedPreviewCode: 'transformed code',
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: false,
      });
      expect(result).toMatchSnapshot();
    });

    it('should return auto prompt if transformedSetupCode is defined and if transformedPreviewCode is null', () => {
      const result = addonA11yAddonTest.prompt({
        setupFile: 'vitest.setup.ts',
        transformedSetupCode: 'transformed code',
        previewFile: null,
        transformedPreviewCode: null,
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: false,
      });
      expect(result).toMatchSnapshot();
    });

    it('should return auto prompt if transformedSetupCode is defined and if transformedPreviewCode is skipped', () => {
      const result = addonA11yAddonTest.prompt({
        setupFile: 'vitest.setup.ts',
        transformedSetupCode: 'transformed code',
        previewFile: null,
        transformedPreviewCode: null,
        skipPreviewTransformation: true,
        skipVitestSetupTransformation: false,
      });
      expect(result).toMatchSnapshot();
    });

    it('should return auto prompt if transformedPreviewCode is defined and if transformedSetupCode is skipped', () => {
      const result = addonA11yAddonTest.prompt({
        setupFile: null,
        transformedSetupCode: null,
        previewFile: 'preview.js',
        transformedPreviewCode: 'transformed code',
        skipPreviewTransformation: false,
        skipVitestSetupTransformation: true,
      });
      expect(result).toMatchSnapshot();
    });
  });

  describe('run', () => {
    it('should write transformed setup code to file', async () => {
      const setupFile = '/path/to/vitest.setup.ts';
      const transformedSetupCode = 'transformed code';

      await addonA11yAddonTest.run?.({
        result: {
          setupFile,
          transformedSetupCode,
          previewFile: null,
          transformedPreviewCode: null,
        },
      } as any);

      expect(writeFileSync).toHaveBeenCalledWith(setupFile, transformedSetupCode, 'utf8');
    });

    it('should write transformed preview code to file', async () => {
      const previewFile = '/path/to/preview.ts';
      const transformedPreviewCode = 'transformed code';

      await addonA11yAddonTest.run?.({
        result: {
          setupFile: null,
          transformedSetupCode: null,
          previewFile: previewFile,
          transformedPreviewCode: transformedPreviewCode,
        },
      } as any);

      expect(writeFileSync).toHaveBeenCalledWith(previewFile, transformedPreviewCode, 'utf8');
    });

    it('should not write to file if setupFile or transformedSetupCode is null', async () => {
      await addonA11yAddonTest.run?.({
        result: { setupFile: null, transformedSetupCode: null },
      } as any);

      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('transformSetupFile', async () => {
    it('should throw', async () => {
      const setupFile = '/path/to/vitest.setup.ts';
      const source = dedent`
        import { beforeAll } from 'vitest';
        import { setProjectAnnotations } from 'storybook';

        beforeAll(project.beforeAll);
      `;

      vi.mocked(readFileSync).mockReturnValue(source);

      expect(() => transformSetupFile(setupFile)).toThrow();
    });

    it('should transform setup file correctly - 1', () => {
      const setupFile = '/path/to/vitest.setup.ts';
      const source = dedent`
        import { beforeAll } from 'vitest';
        import { setProjectAnnotations } from 'storybook';
        import * as projectAnnotations from './preview';

        const project = setProjectAnnotations([projectAnnotations]);

        beforeAll(project.beforeAll);
      `;
      vi.mocked(readFileSync).mockReturnValue(source);

      const s = readFileSync(setupFile, 'utf8');
      const transformedCode = transformSetupFile(s);
      expect(transformedCode).toMatchInlineSnapshot(`
        "import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
        import { beforeAll } from 'vitest';
        import { setProjectAnnotations } from 'storybook';
        import * as projectAnnotations from './preview';

        const project = setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

        beforeAll(project.beforeAll);"
      `);
    });

    it('should transform setup file correctly - 2 (different format)', () => {
      const setupFile = '/path/to/vitest.setup.ts';
      const source = dedent`
        import { beforeAll } from 'vitest';
        import { setProjectAnnotations } from 'storybook';
        import * as projectAnnotations from './preview';

        const project = setProjectAnnotations([
          projectAnnotations
        ]);

        beforeAll(project.beforeAll);
      `;
      vi.mocked(readFileSync).mockReturnValue(source);

      const s = readFileSync(setupFile, 'utf8');
      const transformedCode = transformSetupFile(s);
      expect(transformedCode).toMatchInlineSnapshot(`
          "import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
          import { beforeAll } from 'vitest';
          import { setProjectAnnotations } from 'storybook';
          import * as projectAnnotations from './preview';

          const project = setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

          beforeAll(project.beforeAll);"
        `);
    });

    it('should transform setup file correctly - project annotation is not an array', () => {
      const setupFile = '/path/to/vitest.setup.ts';
      const source = dedent`
        import { beforeAll } from 'vitest';
        import { setProjectAnnotations } from 'storybook';
        import * as projectAnnotations from './preview';

        const project = setProjectAnnotations(projectAnnotations);

        beforeAll(project.beforeAll);
      `;
      vi.mocked(readFileSync).mockReturnValue(source);

      const s = readFileSync(setupFile, 'utf8');
      const transformedCode = transformSetupFile(s);
      expect(transformedCode).toMatchInlineSnapshot(dedent`
        "import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
        import { beforeAll } from 'vitest';
        import { setProjectAnnotations } from 'storybook';
        import * as projectAnnotations from './preview';

        const project = setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

        beforeAll(project.beforeAll);"
      `);
    });
  });

  describe('transformPreviewFile', () => {
    it('should add a new tags property if it does not exist', async () => {
      const source = dedent`
        import type { Preview } from '@storybook/react';
  
        const preview: Preview = {
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },
        };
  
        export default preview;
      `;

      const transformed = await transformPreviewFile(source, process.cwd());
      const expected = dedent`
        import type { Preview } from '@storybook/react';
  
        const preview: Preview = {
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },

          // a11y-test tag controls whether accessibility tests are run as part of a standalone Vitest test run
          // For more information please visit: https://storybook.js.org/docs/writing-tests/accessibility-testing
          tags: [/*'a11y-test'*/]
        };
  
        export default preview;
      `;

      expect(transformed).toBe(await formatFileContent(process.cwd(), expected));
    });

    it('should add a new tags property if it does not exist and a default export does not exist', async () => {
      const source = dedent`
        export const parameters = {
          controls: {
            matchers: {
              color: /(background|color)$/i,
              date: /Date$/i,
            },
          },
        }
      `;

      const transformed = await transformPreviewFile(source, process.cwd());
      const expected = dedent`
        export const parameters = {
          controls: {
            matchers: {
              color: /(background|color)$/i,
              date: /Date$/i,
            },
          },
        }
        export const tags = ["a11y-test"];
      `;

      expect(transformed).toBe(await formatFileContent(process.cwd(), expected));
    });

    it('should extend the existing tags property', async () => {
      const source = dedent`
        import type { Preview } from "@storybook/react";
  
        const preview: Preview = {
          tags: ["existingTag"],
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },
        };
  
        export default preview;
      `;

      const transformed = await transformPreviewFile(source, process.cwd());
      const expected = dedent`
        import type { Preview } from "@storybook/react";
  
        const preview: Preview = {
          // a11y-test tag controls whether accessibility tests are run as part of a standalone Vitest test run
          // For more information please visit: https://storybook.js.org/docs/writing-tests/accessibility-testing
          tags: ["existingTag"/*, "a11y-test"*/],
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },
        };
  
        export default preview;
      `;

      expect(transformed).toBe(await formatFileContent(process.cwd(), expected));
    });

    it('should not add a11y-test if it already exists in the tags property', async () => {
      const expected = dedent`
        import type { Preview } from "@storybook/react";
  
        const preview: Preview = {
          tags: ["a11y-test"],
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },
        };
  
        export default preview;
      `;

      const transformed = await transformPreviewFile(expected, process.cwd());

      expect(transformed).toBe(await formatFileContent(process.cwd(), expected));
    });

    it('should handle the default export without type annotations', async () => {
      const source = dedent`
        export default {
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },
        };
      `;

      const transformed = await transformPreviewFile(source, process.cwd());
      const expected = dedent`
        export default {
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },

          // a11y-test tag controls whether accessibility tests are run as part of a standalone Vitest test run
          // For more information please visit: https://storybook.js.org/docs/writing-tests/accessibility-testing
          tags: [/*"a11y-test"*/]
        };
      `;

      expect(transformed).toBe(await formatFileContent(process.cwd(), expected));
    });

    it('should extend the existing tags property without type annotations', async () => {
      const source = dedent`
        export default {
          tags: ["existingTag"],
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },
        };
      `;

      const transformed = await transformPreviewFile(source, process.cwd());
      const expected = dedent`
        export default {
          // a11y-test tag controls whether accessibility tests are run as part of a standalone Vitest test run
          // For more information please visit: https://storybook.js.org/docs/writing-tests/accessibility-testing
          tags: ["existingTag"/*, "a11y-test"*/],
          parameters: {
            controls: {
              matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
              },
            },
          },
        };
      `;

      expect(transformed).toBe(await formatFileContent(process.cwd(), expected));
    });
  });
});
