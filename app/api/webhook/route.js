import { POST as processPost, GET as processGet } from '../webhooks/process/route';

export async function POST(request) {
  return processPost(request);
}

export async function GET(request) {
  return processGet(request);
}
