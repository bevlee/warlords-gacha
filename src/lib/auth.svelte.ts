import { pb } from './pb';

export interface AuthUser {
  id: string;
  username: string;
}

function toUser(record: unknown): AuthUser | null {
  const r = record as { id?: string; username?: string } | null;
  return r?.id ? { id: r.id, username: r.username ?? '' } : null;
}

class Auth {
  user = $state<AuthUser | null>(toUser(pb.authStore.record));

  constructor() {
    pb.authStore.onChange(() => {
      this.user = toUser(pb.authStore.record);
    });
  }

  async login(email: string, password: string) {
    await pb.collection('users').authWithPassword(email, password);
  }

  async register(email: string, password: string, username: string) {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      username,
    });
    await this.login(email, password);
  }

  logout() {
    pb.authStore.clear();
  }
}

export const auth = new Auth();
