import React, { useState } from 'react';
import { Mail, MapPin, Phone, Send } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient from '../api/axiosClient';

const Contact = () => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await axiosClient.post('/contacts', {
        ...formData,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
      });

      toast.success('Your message has been sent successfully!');
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (error: any) {
      const errorMsg = error.response?.data?.message;
      toast.error(Array.isArray(errorMsg) ? errorMsg[0] : errorMsg || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          {/* Left Side: Contact Information */}
          <div className="space-y-12">
            <div>
              {/* Đã xóa <br/> để text nằm trên 1 hàng */}
              <h1 className="text-5xl font-black tracking-tighter text-black uppercase mb-6 leading-none">
                Get in touch
              </h1>
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
                  <p className="text-gray-500 font-medium">Nha Trang City,<br/>Khanh Hoa, Vietnam</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-[#F5F5F7] rounded-xl flex items-center justify-center shrink-0">
                  <Mail size={20} className="text-black" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-1">Email Us</h3>
                  <p className="text-gray-500 font-medium">support@nexus.com<br/>contact@nexus.com</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-[#F5F5F7] rounded-xl flex items-center justify-center shrink-0">
                  <Phone size={20} className="text-black" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-1">Call Us</h3>
                  <p className="text-gray-500 font-medium">+84 123 456 789<br/>Mon-Fri, 9am - 5pm ICT</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Contact Form */}
          <div className="bg-[#F5F5F7] p-10 rounded-[2rem] border border-gray-100 shadow-sm">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-8">Send a Message</h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Row 1: Full Name & Email Address */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Full Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-white border-none rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-black outline-none font-medium transition-all" 
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Email Address</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full bg-white border-none rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-black outline-none font-medium transition-all" 
                  />
                </div>
              </div>

              {/* Row 2: Subject */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Subject</label>
                <input 
                  type="text" 
                  required 
                  placeholder="What is this about?"
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  className="w-full bg-white border-none rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-black outline-none font-medium transition-all" 
                />
              </div>

              {/* Row 3: Message */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Your Message (Min 10 chars)</label>
                <textarea 
                  required 
                  minLength={10}
                  rows={5} 
                  placeholder="How can we help you?"
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  className="w-full bg-white border-none rounded-xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-black outline-none font-medium resize-none transition-all"
                ></textarea>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-gray-800 transition-all shadow-lg shadow-black/10 flex items-center justify-center space-x-2"
              >
                <span>{loading ? 'Sending...' : 'Submit Request'}</span>
                {!loading && <Send size={14} />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;