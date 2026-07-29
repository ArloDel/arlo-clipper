'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Text } from '@cloudflare/kumo';
import styles from './login.module.css';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError('ACCESS DENIED');
      }
    } catch (err) {
      setError('SYSTEM ERROR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <form onSubmit={handleLogin} className={styles.loginForm}>
        <h1 className={styles.title}>IDENTIFY</h1>
        
        {error && <Text className={styles.error}>{error}</Text>}
        
        <Input 
          type="password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="SECRET KEY"
          className={styles.input}
          size="lg"
          required
        />
        
        <Button 
          type="submit" 
          variant="primary" 
          size="lg"
          loading={loading}
          style={{ width: '100%', borderRadius: 0, marginTop: '1rem', fontWeight: 'bold' }}
        >
          ENTER
        </Button>
      </form>
    </main>
  );
}
