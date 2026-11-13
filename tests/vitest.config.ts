export default {
  resolve: {
    alias: { '@': new URL('../src', import.meta.url).pathname }
  },
  test: {
    environment: 'node',
    include: ['tests/drawable-bounds.test.ts']
  }
}
