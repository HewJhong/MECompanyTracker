import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { CurrentUserProvider } from '../contexts/CurrentUserContext';
import { BackgroundTasksProvider } from '../contexts/BackgroundTasksContext';
import { SheetDataProvider } from '../contexts/SheetDataContext';
import BackgroundTaskIndicator from '../components/BackgroundTaskIndicator';

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
    return (
        <SessionProvider session={session}>
            <CurrentUserProvider>
                <BackgroundTasksProvider>
                    <SheetDataProvider>
                        <BackgroundTaskIndicator />
                        <Component {...pageProps} />
                    </SheetDataProvider>
                </BackgroundTasksProvider>
            </CurrentUserProvider>
        </SessionProvider>
    );
}
