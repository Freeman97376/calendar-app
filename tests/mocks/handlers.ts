import { HttpResponse, http } from 'msw'

export const handlers = [
  http.get('http://127.0.0.1:8787/api/config', () =>
    HttpResponse.json({
      success: true,
      deepseek: {
        configured: false,
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-chat',
      },
      fridge: {
        data_dir: 'backend/data',
      },
    }),
  ),
  http.patch('http://127.0.0.1:8787/api/config', async ({ request }) => {
    const body = (await request.json()) as {
      deepseek_base_url?: string
      deepseek_model?: string
      fridge_data_dir?: string
    }

    return HttpResponse.json({
      success: true,
      deepseek: {
        configured: true,
        base_url: body.deepseek_base_url ?? 'https://api.deepseek.com',
        model: body.deepseek_model ?? 'deepseek-chat',
      },
      fridge: {
        data_dir: body.fridge_data_dir ?? 'backend/data',
      },
    })
  }),
]
