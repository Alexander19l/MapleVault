import { lazy, Suspense, type FC } from 'react';
import { useMessagePartText } from '@assistant-ui/react';

const MarkdownText = lazy(() => import('./markdown-text').then(module => ({
  default: module.MarkdownText
})));

const PlainTextFallback: FC = () => {
  const { text } = useMessagePartText();
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {text}
    </p>
  );
};

export const LazyMarkdownText: FC = () => (
  <Suspense fallback={<PlainTextFallback />}>
    <MarkdownText />
  </Suspense>
);
