export default function GraciasPage() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6 py-10">
      <section className="w-full max-w-2xl text-center rounded-3xl border border-green-200 bg-green-50 p-8 md:p-12 shadow-sm">
        <div className="text-7xl md:text-8xl" aria-hidden="true">
          ✅
        </div>
        <h1 className="mt-6 text-4xl md:text-5xl font-extrabold text-green-800">
          ¡Pedido confirmado!
        </h1>
        <p className="mt-5 text-xl md:text-2xl leading-relaxed text-green-700">
          Tu pedido está en camino. En breve recibirás una confirmación por WhatsApp.
        </p>
        <p className="mt-8 text-2xl md:text-3xl font-bold text-green-900">
          El Rincón de Pepe 🍕
        </p>
      </section>
    </main>
  );
}
