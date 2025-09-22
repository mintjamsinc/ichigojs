// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/ichigo.esm.js',
        format: 'esm',
        sourcemap: true,
      },
      {
        file: 'dist/ichigo.umd.js',
        format: 'umd',
        name: 'ichigo',
        sourcemap: true,
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ]
  }
];
