type BrandLogoProps = {
  variant?: "light" | "dark";
  className?: string;
};

export default function BrandLogo({ variant = "light", className = "" }: BrandLogoProps) {
  return (
    <span className={`brand-logo ${className}`.trim()} aria-label="4Byts Food">
      <img
        src={variant === "dark" ? "/assets/logo-footer.png" : "/assets/logo.png"}
        alt="4Byts"
      />
    </span>
  );
}
