// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import terser from '@rollup/plugin-terser';

export default [
  // Development builds
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/ichigo.esm.js',
        format: 'esm',
        sourcemap: true,
      },
      {
        file: 'dist/ichigo.cjs',
        format: 'umd',
        name: 'ichigo',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/ichigo.umd.js',
        format: 'umd',
        name: 'ichigo',
        sourcemap: true,
        exports: 'named',
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        useTsconfigDeclarationDir: true,
        clean: true
      }),
    ]
  },
  // Production builds (minified)
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/ichigo.esm.min.js',
        format: 'esm',
        sourcemap: false,
      },
      {
        file: 'dist/ichigo.min.cjs',
        format: 'umd',
        name: 'ichigo',
        sourcemap: false,
        exports: 'named',
      },
      {
        file: 'dist/ichigo.umd.min.js',
        format: 'umd',
        name: 'ichigo',
        sourcemap: false,
        exports: 'named',
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        useTsconfigDeclarationDir: true,
        clean: true
      }),
      terser(),
    ]
  }
];
