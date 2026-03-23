import React from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { toast } from 'react-toastify';

const Contact = () => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // English toast message
    toast.success('Your message has been sent successfully. We will contact you soon.');
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          {/* Left Side: Contact Information */}
          <div className="space-y-12">
            <div>
              <h1 className="text-5xl font-black tracking-tighter text-black uppercase mb-6">Get in touch</h1>
              <p className="text-gray-500 text-base font-medium leading-relaxed max-w-md">
                Have a question about our professional gear? Our team is here to help you build the perfect setup.
              </p>
            </div>

            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-[#F5F5F7] rounded-xl flex items-center justify-center shrink-0">
                  <MapPin size={20} className="text-black" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-1">Headquarters</h3>
                  <p className="text-gray-500 font-medium">123 Nexus Blvd, Tech District<br/>San Francisco, CA 94103</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-[#F5F5F7] rounded-xl flex items-center justify-center shrink-0">
                  <Mail size={20} className="text-black" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-1">Email Us</h3>
                  <p className="text-gray-500 font-medium">support@nexus.com<br/>partners@nexus.com</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-[#F5F5F7] rounded-xl flex items-center justify-center shrink-0">
                  <Phone size={20} className="text-black" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-1">Call Us</h3>
                  <p className="text-gray-500 font-medium">+1 (800) NEXUS-GEAR<br/>Mon-Fri, 9am - 5pm PST</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Contact Form */}
          <div className="bg-[#F5F5F7] p-10 rounded-[2rem] border border-gray-100">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-8">Send a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">First Name</label>
                  <input type="text" required placeholder="John" className="w-full bg-white border-none rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-black outline-none font-medium transition-all" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Last Name</label>
                  <input type="text" required placeholder="Doe" className="w-full bg-white border-none rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-black outline-none font-medium transition-all" />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Email Address</label>
                <input type="email" required placeholder="john@example.com" className="w-full bg-white border-none rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-black outline-none font-medium transition-all" />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Message</label>
                <textarea required rows={5} placeholder="How can we help you?" className="w-full bg-white border-none rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-black outline-none font-medium resize-none transition-all"></textarea>
              </div>

              <button type="submit" className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-gray-800 transition-all shadow-lg shadow-black/10">
                Submit Request
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Contact;