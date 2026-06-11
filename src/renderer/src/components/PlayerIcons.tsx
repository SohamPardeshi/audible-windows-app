// Transport icons for the player. The skip-back / skip-forward glyphs are the
// real Audible "wrap-around 30" marks (a circular arrow looping around the
// number) so they match the official cloud player. They use currentColor so the
// surrounding button controls their colour on hover/active.
import type { JSX } from 'react'

interface IconProps {
  className?: string
}

export function SkipBack30Icon({ className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M47 28C47 38.4934 38.4935 47 28 47C17.8421 47 9.54593 39.0286 9.02591 29H7.02344C7.5454 40.1336 16.7373 49 28 49C39.598 49 49 39.598 49 28C49 16.402 39.598 7 28 7C27.9918 7 27.9835 7 27.9752 7.00001L28 7V9C38.4935 9 47 17.5066 47 28Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.2443 7.65824L27.0925 4.1223C27.5911 3.84894 28.0001 4.0494 28.0001 4.56852V11.4321C28.0001 11.9502 27.5911 12.1507 27.0925 11.8784L20.2443 8.34242C20.2443 8.34242 20.0001 8.19923 20.0001 7.99981C20.0001 7.80039 20.2443 7.65824 20.2443 7.65824Z"
        fill="currentColor"
      />
      <path
        d="M24.8381 26.856C26.2941 27.24 27.1101 28.296 27.1101 29.672C27.1101 31.624 25.7341 33.16 23.3341 33.16C21.4941 33.16 20.0701 32.36 19.4621 30.696L21.3981 29.544C21.6861 30.696 22.5021 31.224 23.2221 31.224C24.0541 31.224 24.7581 30.6 24.7581 29.464C24.7581 28.104 23.8141 27.752 22.9021 27.752H22.5341V26.04H22.9181C23.7821 26.04 24.5661 25.56 24.5661 24.424C24.5661 23.528 24.0861 23 23.2701 23C22.3421 23 21.8621 23.736 21.5261 24.728L19.6221 23.752C20.1981 22.2 21.4301 21.096 23.3341 21.096C25.4781 21.096 26.8221 22.44 26.8221 24.168C26.8221 25.48 26.0541 26.392 24.8381 26.856ZM32.3416 33.16C31.0936 33.16 30.1336 32.712 29.4936 31.896C28.7576 30.936 28.4536 29.464 28.4536 27.704V26.552C28.4536 24.792 28.7896 23.304 29.4936 22.36C30.1176 21.544 31.0936 21.096 32.3416 21.096C33.5896 21.096 34.5656 21.512 35.1736 22.36C35.8776 23.32 36.2296 24.792 36.2296 26.552V27.704C36.2296 29.464 35.9096 30.952 35.1736 31.896C34.5656 32.712 33.5896 33.16 32.3416 33.16ZM32.3416 30.968C32.7736 30.968 33.1416 30.76 33.3976 30.264C33.6696 29.768 33.7976 28.952 33.7976 27.768V26.488C33.7976 25.304 33.6536 24.488 33.3976 23.992C33.1416 23.496 32.7736 23.288 32.3416 23.288C31.9096 23.288 31.5416 23.496 31.2856 23.992C31.0296 24.488 30.8856 25.304 30.8856 26.488V27.768C30.8856 28.952 31.0296 29.768 31.2856 30.264C31.5416 30.76 31.9096 30.968 32.3416 30.968Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function SkipForward30Icon({ className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M46.9741 29C46.4541 39.0286 38.158 47 28 47C17.5066 47 9 38.4934 9 28C9 17.5066 17.5066 9 28 9V7C16.402 7 7 16.402 7 28C7 39.598 16.402 49 28 49C39.2628 49 48.4547 40.1336 48.9766 29H46.9741Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M28.9075 4.1223C28.409 3.84894 28 4.0494 28 4.56852V11.4321C28 11.9502 28.409 12.1507 28.9075 11.8784L35.7557 8.34242C35.7557 8.34242 36 8.19923 36 7.99981C36 7.80039 35.7557 7.65824 35.7557 7.65824L28.9075 4.1223Z"
        fill="currentColor"
      />
      <path
        d="M24.8381 26.856C26.2941 27.24 27.1101 28.296 27.1101 29.672C27.1101 31.624 25.7341 33.16 23.3341 33.16C21.4941 33.16 20.0701 32.36 19.4621 30.696L21.3981 29.544C21.6861 30.696 22.5021 31.224 23.2221 31.224C24.0541 31.224 24.7581 30.6 24.7581 29.464C24.7581 28.104 23.8141 27.752 22.9021 27.752H22.5341V26.04H22.9181C23.7821 26.04 24.5661 25.56 24.5661 24.424C24.5661 23.528 24.0861 23 23.2701 23C22.3421 23 21.8621 23.736 21.5261 24.728L19.6221 23.752C20.1981 22.2 21.4301 21.096 23.3341 21.096C25.4781 21.096 26.8221 22.44 26.8221 24.168C26.8221 25.48 26.0541 26.392 24.8381 26.856ZM32.3416 33.16C31.0936 33.16 30.1336 32.712 29.4936 31.896C28.7576 30.936 28.4536 29.464 28.4536 27.704V26.552C28.4536 24.792 28.7896 23.304 29.4936 22.36C30.1176 21.544 31.0936 21.096 32.3416 21.096C33.5896 21.096 34.5656 21.512 35.1736 22.36C35.8776 23.32 36.2296 24.792 36.2296 26.552V27.704C36.2296 29.464 35.9096 30.952 35.1736 31.896C34.5656 32.712 33.5896 33.16 32.3416 33.16ZM32.3416 30.968C32.7736 30.968 33.1416 30.76 33.3976 30.264C33.6696 29.768 33.7976 28.952 33.7976 27.768V26.488C33.7976 25.304 33.6536 24.488 33.3976 23.992C33.1416 23.496 32.7736 23.288 32.3416 23.288C31.9096 23.288 31.5416 23.496 31.2856 23.992C31.0296 24.488 30.8856 25.304 30.8856 26.488V27.768C30.8856 28.952 31.0296 29.768 31.2856 30.264C31.5416 30.76 31.9096 30.968 32.3416 30.968Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function PlayIcon({ className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.4-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" fill="currentColor" />
    </svg>
  )
}

export function PauseIcon({ className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6" y="5" width="4" height="14" rx="1.4" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.4" fill="currentColor" />
    </svg>
  )
}

export function PrevChapterIcon({ className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6" y="5" width="2.2" height="14" rx="1.1" fill="currentColor" />
      <path d="M19 6.2v11.6a1 1 0 0 1-1.53.85l-8.2-5.8a1 1 0 0 1 0-1.7l8.2-5.8A1 1 0 0 1 19 6.2Z" fill="currentColor" />
    </svg>
  )
}

export function NextChapterIcon({ className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 6.2v11.6a1 1 0 0 0 1.53.85l8.2-5.8a1 1 0 0 0 0-1.7l-8.2-5.8A1 1 0 0 0 5 6.2Z" fill="currentColor" />
      <rect x="15.8" y="5" width="2.2" height="14" rx="1.1" fill="currentColor" />
    </svg>
  )
}
