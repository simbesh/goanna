export default {
  input: '../../openapi/openapi.yaml',
  output: {
    path: 'src/generated',
  },
  plugins: [
    '@hey-api/typescript',
    '@hey-api/sdk',
    '@hey-api/client-fetch',
    {
      name: '@tanstack/react-query',
      mutationOptions: true,
      queryKeys: true,
      queryOptions: true,
    },
  ],
}
