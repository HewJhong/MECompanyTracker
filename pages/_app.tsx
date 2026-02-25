import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { CurrentUserProvider } from '../contexts/CurrentUserContext';
import { BackgroundTasksProvider } from '../contexts/BackgroundTasksContext';
import BackgroundTaskIndicator from '../components/BackgroundTaskIndicator';

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
    return (
        <SessionProvider session={session}>
            <CurrentUserProvider>
                <BackgroundTasksProvider>
                    <BackgroundTaskIndicator />
                    <Component {...pageProps} />
                </BackgroundTasksProvider>
            </CurrentUserProvider>
        </SessionProvider>
    );
}
