/** One worker generation owns all requests. Termination rejects every outstanding promise. */
export class WorkerRPC {
  private sequence = 0
  private pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>()
  private closed = false
  constructor(private worker: Worker) {
    worker.onmessage = ({ data }) => {
      const job = this.pending.get(data.id)
      if (!job)
        return
      clearTimeout(job.timer)
      this.pending.delete(data.id)
      if (data.error)
        job.reject(new Error(data.error))
      else
        job.resolve(data.result)
    }
    worker.onerror = () => this.close(new Error('Scanner worker failed'))
    worker.onmessageerror = () => this.close(new Error('Scanner worker response failed'))
  }
  request<T>(type: string, payload?: unknown, transfer: Transferable[] = [], timeout = 15000): Promise<T> {
    if (this.closed)
      return Promise.reject(new Error('Scanner stopped'))
    const id = ++this.sequence
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.close(new Error('Scanner operation timed out')), timeout)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.worker.postMessage({ id, type, payload }, transfer)
      }
      catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }
  close(error = new Error('Scanner stopped')) {
    this.closed = true
    this.worker.terminate()
    for (const job of this.pending.values()) {
      clearTimeout(job.timer)
      job.reject(error)
    }
    this.pending.clear()
  }
}
