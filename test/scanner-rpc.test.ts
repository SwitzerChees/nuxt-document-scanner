import { expect, test } from 'vitest'
import { WorkerRPC } from '../src/runtime/core/rpc'

class FakeWorker {
  onmessage?: (event: {
    data: unknown;
  }) => void
  onerror?: () => void
  onmessageerror?: () => void
  sent: {
    id: number;
    type: string;
  }[] = []
  terminated = false
  postMessage(message: {
    id: number;
    type: string;
  }) { this.sent.push(message) }
  terminate() { this.terminated = true }
  reply(id: number, result: unknown) { this.onmessage?.({ data: { id, result } }) }
}
test('out-of-order responses resolve only the matching request', async () => {
  const worker = new FakeWorker(), rpc = new WorkerRPC(worker as unknown as Worker)

  const a = rpc.request('first'), b = rpc.request('second')

  worker.reply(worker.sent[1]!.id, 'b')

  worker.reply(worker.sent[0]!.id, 'a')

  expect(await a).toBe('a')

  expect(await b).toBe('b')

  rpc.close()
})
test('a timed-out generation terminates and rejects all pending work', async () => {
  const worker = new FakeWorker(), rpc = new WorkerRPC(worker as unknown as Worker)

  const a = rpc.request('hang', undefined, [], 10), b = rpc.request('queued')

  const results = await Promise.allSettled([a, b])

  expect(results.map(r => r.status)).toEqual(['rejected', 'rejected'])

  expect(worker.terminated).toBe(true)

  await expect(rpc.request('late')).rejects.toThrow('stopped')
})
test('close rejects requests and ignores late messages', async () => {
  const worker = new FakeWorker(), rpc = new WorkerRPC(worker as unknown as Worker)

  const result = rpc.request('pending')

  rpc.close()

  worker.reply(1, 'late')

  await expect(result).rejects.toThrow('stopped')
})
