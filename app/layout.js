import "./globals.css";

export const metadata = {
  title: "Smart Task Allocation",
  description: "FYP Smart Task Allocation Application"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
