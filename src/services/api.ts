import { DecisionRecord, PromptLabData, DebateArenaSession, DebateFactCheckResult } from '../types';
import { storageService } from './storage';

export class OfflineException extends Error {
  constructor(message = 'Network connection offline. Live search requires active internet access.') {
    super(message);
    this.name = 'OfflineException';
  }
}

export const apiService = {
  checkNetwork(): boolean {
    if (storageService.isOfflineOverride()) {
      return false;
    }
    return navigator.onLine;
  },

  async researchDecision(params: {
    question: string;
    constraints?: string;
    category?: string;
    followUpContext?: string;
    previousVerdict?: any;
  }): Promise<DecisionRecord> {
    if (!this.checkNetwork()) {
      throw new OfflineException();
    }

    const response = await fetch('/api/verdict/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to execute decision research';
      try {
        const errorData = await response.json();
        if (errorData.error) errorMessage = errorData.error;
      } catch {}
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (!data.decision) {
      throw new Error('Malformed decision response from analyst engine.');
    }

    return data.decision as DecisionRecord;
  },

  async researchDecisionStream(
    params: {
      question: string;
      constraints?: string;
      category?: string;
      followUpContext?: string;
      previousVerdict?: any;
    },
    onProgress?: (progress: { stage: string; step: number; totalSteps: number }) => void
  ): Promise<DecisionRecord> {
    if (!this.checkNetwork()) {
      throw new OfflineException();
    }

    try {
      const response = await fetch('/api/verdict/research-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to execute decision research';
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch {}
        throw new Error(errorMessage);
      }

      if (!response.body) {
        return this.researchDecision(params);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalDecision: DecisionRecord | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = 'message';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (currentEvent === 'progress' && onProgress) {
                onProgress(data);
              } else if (currentEvent === 'complete') {
                finalDecision = data.decision;
              } else if (currentEvent === 'error') {
                throw new Error(data.error || 'Research execution failed');
              }
            } catch (err: any) {
              if (currentEvent === 'error') throw err;
            }
          }
        }
      }

      if (finalDecision) {
        return finalDecision;
      }

      // Fallback
      return this.researchDecision(params);
    } catch (err: any) {
      if (err instanceof OfflineException) throw err;
      // If streaming is not supported or failed mid-way, fallback to standard endpoint
      return this.researchDecision(params);
    }
  },

  async recheckDecision(decision: DecisionRecord): Promise<{ decision: DecisionRecord; delta: string }> {
    if (!this.checkNetwork()) {
      throw new OfflineException();
    }

    const response = await fetch('/api/verdict/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });

    if (!response.ok) {
      let msg = 'Failed to re-check decision';
      try {
        const data = await response.json();
        if (data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }

    const data = await response.json();
    return {
      decision: data.decision as DecisionRecord,
      delta: data.delta || 'Re-checked live data.',
    };
  },

  async generatePromptLab(requestText: string): Promise<PromptLabData> {
    if (!this.checkNetwork()) {
      throw new OfflineException();
    }

    const response = await fetch('/api/prompt-lab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestText }),
    });

    if (!response.ok) {
      let msg = 'Prompt Lab generation failed';
      try {
        const data = await response.json();
        if (data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }

    const data = await response.json();
    return data.lab as PromptLabData;
  },

  async runDebateArena(params: {
    topic: string;
    sideAName?: string;
    sideBName?: string;
    context?: string;
  }): Promise<DebateArenaSession> {
    if (!this.checkNetwork()) {
      throw new OfflineException();
    }

    const response = await fetch('/api/debate/arena', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      let msg = 'Debate Arena execution failed';
      try {
        const data = await response.json();
        if (data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }

    const data = await response.json();
    return data.debate as DebateArenaSession;
  },

  async sendDebateTurn(params: {
    topic: string;
    userStance?: string;
    aiPersona: 'pragmatist' | 'devils_advocate' | 'skeptic';
    userMessage: string;
    history?: any[];
  }): Promise<any> {
    if (!this.checkNetwork()) {
      throw new OfflineException();
    }

    const response = await fetch('/api/debate/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      let msg = 'Failed to execute debate turn';
      try {
        const data = await response.json();
        if (data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }

    const data = await response.json();
    return data.turn;
  },

  async factCheckClaim(params: { claim: string; topic?: string }): Promise<DebateFactCheckResult> {
    if (!this.checkNetwork()) {
      throw new OfflineException();
    }

    const response = await fetch('/api/debate/fact-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      let msg = 'Failed to execute Google Search fact-check';
      try {
        const data = await response.json();
        if (data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }

    const data = await response.json();
    return data.factCheck as DebateFactCheckResult;
  },
};
